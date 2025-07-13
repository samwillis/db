import { beforeEach, describe, expect, it } from "vitest"
import mitt from "mitt"
import { createCollection } from "../src/collection"
import { createTransaction } from "../src/transactions"
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  length,
  lt,
  lte,
  or,
} from "../src/query/builder/functions"
import type { MutationFn, PendingMutation } from "../src/types"

interface TestItem {
  id: string
  name: string
  age: number
  status: `active` | `inactive` | `pending`
  score?: number
  createdAt: Date
}

// Index usage tracking utilities
interface IndexUsageStats {
  rangeQueryCalls: number
  fullScanCalls: number
  indexesUsed: Array<string>
  queriesExecuted: Array<{
    type: `index` | `fullScan`
    operation?: string
    field?: string
    value?: any
  }>
}

function createIndexUsageTracker(collection: any): {
  stats: IndexUsageStats
  restore: () => void
} {
  const stats: IndexUsageStats = {
    rangeQueryCalls: 0,
    fullScanCalls: 0,
    indexesUsed: [],
    queriesExecuted: [],
  }

  // Track rangeQuery calls (index usage)
  const originalRangeQuery = collection.rangeQuery
  collection.rangeQuery = function (index: any, operation: string, value: any) {
    stats.rangeQueryCalls++
    stats.indexesUsed.push(index.id)
    stats.queriesExecuted.push({
      type: `index`,
      operation,
      field: index.expression?.path?.join(`.`),
      value,
    })
    return originalRangeQuery.call(this, index, operation, value)
  }

  // Track full scan calls (entries() iteration)
  const originalEntries = collection.entries
  collection.entries = function* () {
    // Only count as full scan if we're in a filtering context
    // Check the call stack to see if we're inside createFilterFunction
    const stack = new Error().stack || ``
    if (
      stack.includes(`createFilterFunction`) ||
      stack.includes(`currentStateAsChanges`)
    ) {
      stats.fullScanCalls++
      stats.queriesExecuted.push({
        type: `fullScan`,
      })
    }
    yield* originalEntries.call(this)
  }

  const restore = () => {
    collection.rangeQuery = originalRangeQuery
    collection.entries = originalEntries
  }

  return { stats, restore }
}

// Helper to assert index usage
function expectIndexUsage(
  stats: IndexUsageStats,
  expectations: {
    shouldUseIndex: boolean
    shouldUseFullScan?: boolean
    indexCallCount?: number
    fullScanCallCount?: number
  }
) {
  if (expectations.shouldUseIndex) {
    expect(stats.rangeQueryCalls).toBeGreaterThan(0)
    expect(stats.indexesUsed.length).toBeGreaterThan(0)

    if (expectations.indexCallCount !== undefined) {
      expect(stats.rangeQueryCalls).toBe(expectations.indexCallCount)
    }
  } else {
    expect(stats.rangeQueryCalls).toBe(0)
    expect(stats.indexesUsed.length).toBe(0)
  }

  if (expectations.shouldUseFullScan !== undefined) {
    if (expectations.shouldUseFullScan) {
      expect(stats.fullScanCalls).toBeGreaterThan(0)

      if (expectations.fullScanCallCount !== undefined) {
        expect(stats.fullScanCalls).toBe(expectations.fullScanCallCount)
      }
    } else {
      expect(stats.fullScanCalls).toBe(0)
    }
  }
}

// Helper to run a test with index usage tracking (automatically handles setup/cleanup)
function withIndexTracking(
  collection: any,
  testFn: (tracker: { stats: IndexUsageStats }) => void | Promise<void>
): void | Promise<void> {
  const tracker = createIndexUsageTracker(collection)

  try {
    const result = testFn(tracker)
    if (result instanceof Promise) {
      return result.finally(() => tracker.restore())
    }
    tracker.restore()
  } catch (error) {
    tracker.restore()
    throw error
  }
}

describe(`Collection Indexes`, () => {
  let collection: ReturnType<typeof createCollection<TestItem, string>>
  let testData: Array<TestItem>
  let mutationFn: MutationFn
  let emitter: any

  beforeEach(async () => {
    testData = [
      {
        id: `1`,
        name: `Alice`,
        age: 25,
        status: `active`,
        score: 95,
        createdAt: new Date(`2023-01-01`),
      },
      {
        id: `2`,
        name: `Bob`,
        age: 30,
        status: `inactive`,
        score: 80,
        createdAt: new Date(`2023-01-02`),
      },
      {
        id: `3`,
        name: `Charlie`,
        age: 35,
        status: `active`,
        score: 90,
        createdAt: new Date(`2023-01-03`),
      },
      {
        id: `4`,
        name: `Diana`,
        age: 28,
        status: `pending`,
        score: 85,
        createdAt: new Date(`2023-01-04`),
      },
      {
        id: `5`,
        name: `Eve`,
        age: 22,
        status: `active`,
        score: undefined,
        createdAt: new Date(`2023-01-05`),
      },
    ]

    emitter = mitt()

    // Create mutation handler that syncs changes back via emitter
    mutationFn = ({ transaction }) => {
      emitter.emit(`sync`, transaction.mutations)
      return Promise.resolve()
    }

    collection = createCollection<TestItem, string>({
      getKey: (item) => item.id,
      startSync: true,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Provide initial data through sync
          begin()
          for (const item of testData) {
            write({
              type: `insert`,
              value: item,
            })
          }
          commit()

          // Listen for mutations and sync them back (only register once)
          if (!emitter.all.has(`sync`)) {
            emitter.on(`sync`, (changes: Array<PendingMutation>) => {
              begin()
              changes.forEach((change) => {
                write({
                  type: change.type,
                  value: change.modified as unknown as TestItem,
                })
              })
              commit()
            })
          }
        },
      },
    })

    // Wait for sync to complete
    await collection.stateWhenReady()

    // Verify data was loaded
    expect(collection.size).toBe(5)
  })

  describe(`Index Creation`, () => {
    it(`should create an index on a simple field`, () => {
      const index = collection.createIndex((row) => row.status)

      expect(index.id).toMatch(/^index_\d+$/)
      expect(index.name).toBeUndefined()
      expect(index.expression.type).toBe(`ref`)
      expect(index.indexedKeys.size).toBe(5)
    })

    it(`should create a named index`, () => {
      const index = collection.createIndex((row) => row.age, {
        name: `ageIndex`,
      })

      expect(index.name).toBe(`ageIndex`)
      expect(index.indexedKeys.size).toBe(5)
    })

    it(`should create multiple indexes`, () => {
      const statusIndex = collection.createIndex((row) => row.status)
      const ageIndex = collection.createIndex((row) => row.age)

      expect(statusIndex.id).not.toBe(ageIndex.id)
      expect(statusIndex.indexedKeys.size).toBe(5)
      expect(ageIndex.indexedKeys.size).toBe(5)
    })

    it(`should maintain ordered entries`, () => {
      const ageIndex = collection.createIndex((row) => row.age)

      // Ages should be ordered: 22, 25, 28, 30, 35
      const orderedAges = ageIndex.orderedEntries.map(([age]) => age)
      expect(orderedAges).toEqual([22, 25, 28, 30, 35])
    })

    it(`should handle duplicate values in index`, () => {
      const statusIndex = collection.createIndex((row) => row.status)

      // Should have 3 unique status values
      expect(statusIndex.orderedEntries.length).toBe(3)

      // "active" status should have 3 items
      const activeKeys = statusIndex.valueMap.get(`active`)
      expect(activeKeys?.size).toBe(3)
    })

    it(`should handle undefined/null values`, () => {
      const scoreIndex = collection.createIndex((row) => row.score)

      // Should include the item with undefined score
      expect(scoreIndex.indexedKeys.size).toBe(5)

      // undefined should be first in ordered entries
      const firstValue = scoreIndex.orderedEntries[0]?.[0]
      expect(firstValue).toBeUndefined()
    })
  })

  describe(`Index Maintenance`, () => {
    beforeEach(() => {
      collection.createIndex((row) => row.status)
      collection.createIndex((row) => row.age)
    })

    it(`should reflect mutations in collection state and subscriptions`, async () => {
      const changes: Array<any> = []

      // Subscribe to all changes
      const unsubscribe = collection.subscribeChanges((items) => {
        changes.push(...items)
      })

      const newItem: TestItem = {
        id: `6`,
        name: `Frank`,
        age: 40,
        status: `active`,
        createdAt: new Date(`2023-01-06`),
      }

      const tx = createTransaction({ mutationFn })
      tx.mutate(() => collection.insert(newItem))
      await tx.isPersisted.promise

      // Item should be in collection state
      expect(collection.size).toBe(6)
      expect(collection.get(`6`)).toEqual(newItem)

      // Should trigger subscription
      expect(changes).toHaveLength(1)
      expect(changes[0]?.type).toBe(`insert`)
      expect(changes[0]?.value.name).toBe(`Frank`)

      unsubscribe()
    })

    it(`should reflect updates in collection state and subscriptions`, async () => {
      const changes: Array<any> = []

      const unsubscribe = collection.subscribeChanges((items) => {
        changes.push(...items)
      })

      const tx = createTransaction({ mutationFn })
      tx.mutate(() =>
        collection.update(`1`, (draft) => {
          draft.status = `inactive`
          draft.age = 26
        })
      )
      await tx.isPersisted.promise

      // Updated item should be in collection state
      const updatedItem = collection.get(`1`)
      expect(updatedItem?.status).toBe(`inactive`)
      expect(updatedItem?.age).toBe(26)

      // Should trigger subscription
      expect(changes).toHaveLength(1)
      expect(changes[0]?.type).toBe(`update`)
      expect(changes[0]?.value.status).toBe(`inactive`)

      unsubscribe()
    })

    it(`should reflect deletions in collection state and subscriptions`, async () => {
      const changes: Array<any> = []

      const unsubscribe = collection.subscribeChanges((items) => {
        changes.push(...items)
      })

      const tx = createTransaction({ mutationFn })
      tx.mutate(() => collection.delete(`1`))
      await tx.isPersisted.promise

      // Item should be removed from collection state
      expect(collection.size).toBe(4)
      expect(collection.get(`1`)).toBeUndefined()

      // Should trigger subscription (may be called multiple times in test environment)
      expect(changes.length).toBeGreaterThanOrEqual(1)
      expect(changes[0]?.type).toBe(`delete`)
      expect(changes[0]?.key).toBe(`1`)

      // Ensure all events are the same delete event
      const deleteEvents = changes.filter(
        (c) => c.type === `delete` && c.key === `1`
      )
      expect(deleteEvents.length).toBe(changes.length) // All events should be the same delete

      unsubscribe()
    })

    it(`should handle filtered subscriptions correctly with mutations`, async () => {
      const activeChanges: Array<any> = []

      const unsubscribe = collection.subscribeChanges(
        (items) => {
          activeChanges.push(...items)
        },
        {
          where: (row) => eq(row.status, `active`),
        }
      )

      // Change inactive item to active (should trigger)
      const tx1 = createTransaction({ mutationFn })
      tx1.mutate(() =>
        collection.update(`2`, (draft) => {
          draft.status = `active`
        })
      )
      await tx1.isPersisted.promise

      expect(activeChanges).toHaveLength(1)
      expect(activeChanges[0]?.value.name).toBe(`Bob`)

      // Change active item to inactive (should trigger but item no longer matches filter)
      activeChanges.length = 0
      const tx2 = createTransaction({ mutationFn })
      tx2.mutate(() =>
        collection.update(`1`, (draft) => {
          draft.status = `inactive`
        })
      )
      await tx2.isPersisted.promise

      // Should trigger update but filtered out because no longer matches
      expect(activeChanges).toHaveLength(0)

      unsubscribe()
    })
  })

  describe(`Range Queries`, () => {
    beforeEach(() => {
      collection.createIndex((row) => row.age)
    })

    it(`should perform equality queries`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => eq(row.age, 25),
        })

        expect(result).toHaveLength(1)
        expect(result[0]?.value.name).toBe(`Alice`)

        // Verify 100% index usage
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should perform greater than queries`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => gt(row.age, 28),
        })

        expect(result).toHaveLength(2)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Bob`, `Charlie`])

        // Verify 100% index usage
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should perform greater than or equal queries`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => gte(row.age, 28),
        })

        expect(result).toHaveLength(3)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Bob`, `Charlie`, `Diana`])

        // Verify 100% index usage
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should perform less than queries`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => lt(row.age, 28),
        })

        expect(result).toHaveLength(2)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Eve`])

        // Verify 100% index usage
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should perform less than or equal queries`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => lte(row.age, 28),
        })

        expect(result).toHaveLength(3)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Diana`, `Eve`])

        // Verify 100% index usage
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should fall back to full scan for complex expressions`, () => {
      withIndexTracking(collection, (tracker) => {
        // This should work but use full scan since it's not a simple comparison
        // Using a complex expression that can't be optimized with indexes
        const result = collection.currentStateAsChanges({
          where: (row) => gt(length(row.name), 3),
        })

        expect(result).toHaveLength(3) // Alice, Charlie, Diana (names longer than 3 chars)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Charlie`, `Diana`])

        // Verify full scan is used, no index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: false,
          shouldUseFullScan: true,
          indexCallCount: 0,
          fullScanCallCount: 1,
        })
      })
    })

    it(`should verify index optimization is being used for simple queries`, () => {
      withIndexTracking(collection, (tracker) => {
        // This should use index optimization
        const result = collection.currentStateAsChanges({
          where: (row) => eq(row.age, 25),
        })

        expect(result).toHaveLength(1)
        expect(result[0]?.value.name).toBe(`Alice`)

        // Verify 100% index usage, no full scan
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })

        // Verify the specific index was used
        expect(tracker.stats.indexesUsed[0]).toMatch(/^index_\d+$/)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `age`,
          value: 25,
        })
      })
    })

    it(`should verify different range operations use indexes`, () => {
      withIndexTracking(collection, (tracker) => {
        // Test multiple range operations
        const eqResult = collection.currentStateAsChanges({
          where: (row) => eq(row.age, 25),
        })
        const gtResult = collection.currentStateAsChanges({
          where: (row) => gt(row.age, 30),
        })
        const lteResult = collection.currentStateAsChanges({
          where: (row) => lte(row.age, 28),
        })

        expect(eqResult).toHaveLength(1)
        expect(gtResult).toHaveLength(1) // Charlie (35)
        expect(lteResult).toHaveLength(3) // Alice (25), Diana (28), Eve (22)

        // Should have used index 3 times, no full scans
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 3,
          fullScanCallCount: 0,
        })

        // Verify all operations used indexes
        expect(tracker.stats.queriesExecuted).toHaveLength(3)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `eq`,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `gt`,
        })
        expect(tracker.stats.queriesExecuted[2]).toMatchObject({
          type: `index`,
          operation: `lte`,
        })
      })
    })

    it(`should verify complex expressions fall back to full scan`, () => {
      withIndexTracking(collection, (tracker) => {
        // This should fall back to full scan
        const result = collection.currentStateAsChanges({
          where: (row) => gt(length(row.name), 3),
        })

        expect(result).toHaveLength(3) // Alice, Charlie, Diana

        // Should use full scan, no index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: false,
          shouldUseFullScan: true,
          indexCallCount: 0,
          fullScanCallCount: 1,
        })

        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `fullScan`,
        })
      })
    })

    it(`should verify queries without matching indexes use full scan`, () => {
      withIndexTracking(collection, (tracker) => {
        // Query on a field without an index (status)
        const result = collection.currentStateAsChanges({
          where: (row) => eq(row.status, `active`),
        })

        expect(result).toHaveLength(3) // Alice, Charlie, Eve

        // Should use full scan since no status index exists
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: false,
          shouldUseFullScan: true,
          indexCallCount: 0,
          fullScanCallCount: 1,
        })
      })
    })
  })

  describe(`Complex Query Optimization`, () => {
    beforeEach(() => {
      collection.createIndex((row) => row.age)
      collection.createIndex((row) => row.status)
    })

    it(`should optimize AND queries with range conditions using indexes`, () => {
      withIndexTracking(collection, (tracker) => {
        // Test the key case: range query with AND
        const result = collection.currentStateAsChanges({
          where: (row) => and(gt(row.age, 25), lt(row.age, 35)),
        })

        expect(result).toHaveLength(2) // Bob (30), Diana (28)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Bob`, `Diana`])

        // Verify 100% index usage - should use age index twice
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 2, // gt and lt operations
          fullScanCallCount: 0,
        })

        // Verify both operations used the age index
        expect(tracker.stats.queriesExecuted).toHaveLength(2)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `gt`,
          field: `age`,
          value: 25,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `lt`,
          field: `age`,
          value: 35,
        })
      })
    })

    it(`should optimize AND queries with multiple field conditions`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => and(eq(row.status, `active`), gte(row.age, 25)),
        })

        expect(result).toHaveLength(2) // Alice (25, active), Charlie (35, active)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Charlie`])

        // Verify 100% index usage - should use both status and age indexes
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 2, // eq and gte operations
          fullScanCallCount: 0,
        })

        // Verify different indexes were used
        expect(tracker.stats.queriesExecuted).toHaveLength(2)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `status`,
          value: `active`,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `gte`,
          field: `age`,
          value: 25,
        })
      })
    })

    it(`should optimize OR queries using indexes`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => or(eq(row.age, 25), eq(row.age, 35)),
        })

        expect(result).toHaveLength(2) // Alice (25), Charlie (35)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Charlie`])

        // Verify 100% index usage - should use age index twice
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 2, // Two eq operations
          fullScanCallCount: 0,
        })

        // Verify both operations used the age index
        expect(tracker.stats.queriesExecuted).toHaveLength(2)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `age`,
          value: 25,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `age`,
          value: 35,
        })
      })
    })

    it(`should optimize inArray queries using indexes`, () => {
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => inArray(row.status, [`active`, `pending`]),
        })

        expect(result).toHaveLength(4) // Alice, Charlie, Eve (active), Diana (pending)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Charlie`, `Diana`, `Eve`])

        // Verify 100% index usage - should use status index twice (for each value)
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 2, // Two eq operations for the array values
          fullScanCallCount: 0,
        })

        // Verify both values were looked up using the status index
        expect(tracker.stats.queriesExecuted).toHaveLength(2)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `status`,
          value: `active`,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `status`,
          value: `pending`,
        })
      })
    })

    it(`should optimize complex nested AND/OR expressions`, () => {
      withIndexTracking(collection, (tracker) => {
        // (age >= 25 AND age <= 30) OR status = 'pending'
        const result = collection.currentStateAsChanges({
          where: (row) =>
            or(
              and(gte(row.age, 25), lte(row.age, 30)),
              eq(row.status, `pending`)
            ),
        })

        expect(result).toHaveLength(3) // Alice (25), Bob (30), Diana (28, pending)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Bob`, `Diana`])

        // Verify 100% index usage - should use age index twice + status index once
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 3,
          fullScanCallCount: 0,
        })

        // Verify the operations
        expect(tracker.stats.queriesExecuted).toHaveLength(3)
        expect(tracker.stats.queriesExecuted[0]).toMatchObject({
          type: `index`,
          operation: `gte`,
          field: `age`,
          value: 25,
        })
        expect(tracker.stats.queriesExecuted[1]).toMatchObject({
          type: `index`,
          operation: `lte`,
          field: `age`,
          value: 30,
        })
        expect(tracker.stats.queriesExecuted[2]).toMatchObject({
          type: `index`,
          operation: `eq`,
          field: `status`,
          value: `pending`,
        })
      })
    })

    it(`should fall back to full scan when not all conditions can be optimized`, () => {
      withIndexTracking(collection, (tracker) => {
        // Mix of optimizable and non-optimizable conditions
        const result = collection.currentStateAsChanges({
          where: (row) =>
            and(
              eq(row.status, `active`),
              gt(length(row.name), 4) // Complex expression - can't optimize
            ),
        })

        expect(result).toHaveLength(2) // Alice, Charlie (active with name > 4 chars)
        const names = result.map((r) => r.value.name).sort()
        expect(names).toEqual([`Alice`, `Charlie`])

        // Should fall back to full scan since not all conditions can be optimized
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: false,
          shouldUseFullScan: true,
          indexCallCount: 0,
          fullScanCallCount: 1,
        })
      })
    })

    it(`should optimize queries with missing indexes by falling back gracefully`, () => {
      withIndexTracking(collection, (tracker) => {
        // Query on a field without an index (name)
        const result = collection.currentStateAsChanges({
          where: (row) =>
            and(
              eq(row.age, 25), // Has index
              eq(row.name, `Alice`) // No index on name
            ),
        })

        expect(result).toHaveLength(1) // Alice (25, name Alice)
        expect(result[0]?.value.name).toBe(`Alice`)

        // Should fall back to full scan since name doesn't have an index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: false,
          shouldUseFullScan: true,
          indexCallCount: 0,
          fullScanCallCount: 1,
        })
      })
    })
  })

  describe(`Index Usage Verification`, () => {
    it(`should track multiple indexes and their usage patterns`, () => {
      // Create multiple indexes
      collection.createIndex((row) => row.age, {
        name: `ageIndex`,
      })
      collection.createIndex((row) => row.status, {
        name: `statusIndex`,
      })
      collection.createIndex((row) => row.name, {
        name: `nameIndex`,
      })

      withIndexTracking(collection, (tracker) => {
        // Query using age index
        const ageQuery = collection.currentStateAsChanges({
          where: (row) => gte(row.age, 30),
        })

        // Query using status index
        const statusQuery = collection.currentStateAsChanges({
          where: (row) => eq(row.status, `active`),
        })

        // Query using name index
        const nameQuery = collection.currentStateAsChanges({
          where: (row) => eq(row.name, `Alice`),
        })

        expect(ageQuery).toHaveLength(2) // Bob (30), Charlie (35)
        expect(statusQuery).toHaveLength(3) // Alice, Charlie, Eve
        expect(nameQuery).toHaveLength(1) // Alice

        // Verify all queries used indexes
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 3,
          fullScanCallCount: 0,
        })

        // Verify specific indexes were used
        expect(tracker.stats.indexesUsed).toHaveLength(3)
        expect(tracker.stats.queriesExecuted).toEqual([
          { type: `index`, operation: `gte`, field: `age`, value: 30 },
          { type: `index`, operation: `eq`, field: `status`, value: `active` },
          { type: `index`, operation: `eq`, field: `name`, value: `Alice` },
        ])

        // Test that we can identify which specific index was used
        const usedIndexes = new Set(tracker.stats.indexesUsed)
        expect(usedIndexes.size).toBe(3) // Three different indexes used
      })
    })

    it(`should verify 100% index usage for subscriptions`, () => {
      collection.createIndex((row) => row.status)

      withIndexTracking(collection, (tracker) => {
        const changes: Array<any> = []

        // Subscribe with a where clause that should use index
        const unsubscribe = collection.subscribeChanges(
          (items) => changes.push(...items),
          {
            includeInitialState: true,
            where: (row) => eq(row.status, `active`),
          }
        )

        expect(changes).toHaveLength(3) // Initial active items

        // Verify initial state query used index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })

        unsubscribe()
      })
    })
  })

  describe(`Filtered Subscriptions`, () => {
    beforeEach(() => {
      collection.createIndex((row) => row.age)
      collection.createIndex((row) => row.status)
    })

    it(`should subscribe to filtered changes with index optimization`, async () => {
      await withIndexTracking(collection, async (tracker) => {
        const changes: Array<any> = []

        const unsubscribe = collection.subscribeChanges(
          (items) => {
            changes.push(...items)
          },
          {
            includeInitialState: true,
            where: (row) => eq(row.status, `active`),
          }
        )

        expect(changes).toHaveLength(3) // Initial active items
        expect(changes.map((c) => c.value.name).sort()).toEqual([
          `Alice`,
          `Charlie`,
          `Eve`,
        ])

        // Verify initial state query used index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })

        // Add a new active item
        changes.length = 0
        const tx1 = createTransaction({ mutationFn })
        tx1.mutate(() =>
          collection.insert({
            id: `6`,
            name: `Frank`,
            age: 40,
            status: `active`,
            createdAt: new Date(),
          })
        )
        await tx1.isPersisted.promise

        expect(changes).toHaveLength(1)
        expect(changes[0]?.value.name).toBe(`Frank`)

        // Add an inactive item (should not trigger)
        changes.length = 0
        const tx2 = createTransaction({ mutationFn })
        tx2.mutate(() =>
          collection.insert({
            id: `7`,
            name: `Grace`,
            age: 35,
            status: `inactive`,
            createdAt: new Date(),
          })
        )
        await tx2.isPersisted.promise

        expect(changes).toHaveLength(0)

        // Change an active item to inactive (should not trigger because item no longer matches)
        changes.length = 0
        const tx3 = createTransaction({ mutationFn })
        tx3.mutate(() =>
          collection.update(`1`, (draft) => {
            draft.status = `inactive`
          })
        )
        await tx3.isPersisted.promise

        expect(changes).toHaveLength(0) // No longer matches filter

        unsubscribe()
      })
    })

    it(`should handle range queries in subscriptions`, async () => {
      await withIndexTracking(collection, async (tracker) => {
        const changes: Array<any> = []

        const unsubscribe = collection.subscribeChanges(
          (items) => {
            changes.push(...items)
          },
          {
            includeInitialState: true,
            where: (row) => gte(row.age, 30),
          }
        )

        expect(changes).toHaveLength(2) // Bob (30) and Charlie (35)
        expect(changes.map((c) => c.value.name).sort()).toEqual([
          `Bob`,
          `Charlie`,
        ])

        // Verify initial state query used index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })

        // Update someone to be over 30
        changes.length = 0
        const tx = createTransaction({ mutationFn })
        tx.mutate(() =>
          collection.update(`4`, (draft) => {
            draft.age = 32
          })
        )
        await tx.isPersisted.promise

        expect(changes).toHaveLength(1)
        expect(changes[0]?.value.name).toBe(`Diana`)

        unsubscribe()
      })
    })

    it(`should use indexes for filtered subscription initial state`, async () => {
      collection.createIndex((row) => row.status)

      await withIndexTracking(collection, async (tracker) => {
        const changes: Array<any> = []

        const unsubscribe = collection.subscribeChanges(
          (items) => {
            changes.push(...items)
          },
          {
            includeInitialState: true,
            where: (row) => eq(row.status, `active`),
          }
        )

        expect(changes).toHaveLength(3) // Initial active items

        // Verify initial state query used index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })

        unsubscribe()
      })
    })
  })

  describe(`Performance and Edge Cases`, () => {
    it(`should handle special values correctly in indexes and queries`, async () => {
      // Create a new collection with special values in the initial sync data
      const specialData: Array<TestItem> = [
        ...testData,
        {
          id: `null_age`,
          name: `Null Age`,
          age: null as any,
          status: `active`,
          createdAt: new Date(),
        },
        {
          id: `zero_age`,
          name: `Zero Age`,
          age: 0,
          status: `active`,
          createdAt: new Date(),
        },
        {
          id: `negative_age`,
          name: `Negative Age`,
          age: -5,
          status: `active`,
          createdAt: new Date(),
        },
      ]

      const specialCollection = createCollection<TestItem, string>({
        getKey: (item) => item.id,
        startSync: true,
        sync: {
          sync: ({ begin, write, commit }) => {
            begin()
            for (const item of specialData) {
              write({
                type: `insert`,
                value: item,
              })
            }
            commit()
          },
        },
      })

      await specialCollection.stateWhenReady()

      const ageIndex = specialCollection.createIndex((row) => row.age)

      // Verify index contains all items including special values
      expect(ageIndex.indexedKeys.size).toBe(8) // Original 5 + 3 special
      expect(ageIndex.orderedEntries).toHaveLength(8) // 8 unique age values (including null)

      // Null/undefined should be ordered first
      const firstValue = ageIndex.orderedEntries[0]?.[0]
      expect(firstValue == null).toBe(true)

      // Test that queries with special values use indexes correctly
      withIndexTracking(specialCollection, (tracker) => {
        // Query for zero age
        const zeroAgeResult = specialCollection.currentStateAsChanges({
          where: (row) => eq(row.age, 0),
        })
        expect(zeroAgeResult).toHaveLength(1)
        expect(zeroAgeResult[0]?.value.name).toBe(`Zero Age`)

        // Query for negative age
        const negativeAgeResult = specialCollection.currentStateAsChanges({
          where: (row) => eq(row.age, -5),
        })
        expect(negativeAgeResult).toHaveLength(1)
        expect(negativeAgeResult[0]?.value.name).toBe(`Negative Age`)

        // Query for ages greater than negative
        const gtNegativeResult = specialCollection.currentStateAsChanges({
          where: (row) => gt(row.age, -1),
        })
        expect(gtNegativeResult.length).toBeGreaterThan(0) // Should find positive ages

        // Verify all queries used indexes
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 3,
          fullScanCallCount: 0,
        })
      })
    })

    it(`should handle index creation on empty collection`, () => {
      const emptyCollection = createCollection<TestItem, string>({
        getKey: (item) => item.id,
        sync: { sync: () => {} },
      })

      const index = emptyCollection.createIndex((row) => row.age)

      expect(index.indexedKeys.size).toBe(0)
      expect(index.orderedEntries).toHaveLength(0)
      expect(index.valueMap.size).toBe(0)
    })

    it(`should handle index updates when data changes through sync`, async () => {
      const ageIndex = collection.createIndex((row) => row.age)

      // Original index should have 5 items
      expect(ageIndex.indexedKeys.size).toBe(5)
      expect(ageIndex.orderedEntries).toHaveLength(5)

      // Perform mutations that will sync back and update indexes
      const tx1 = createTransaction({ mutationFn })
      tx1.mutate(() =>
        collection.insert({
          id: `new1`,
          name: `NewItem1`,
          age: 50,
          status: `active`,
          createdAt: new Date(),
        })
      )

      const tx2 = createTransaction({ mutationFn })
      tx2.mutate(() =>
        collection.update(`1`, (draft) => {
          draft.age = 99
        })
      )

      const tx3 = createTransaction({ mutationFn })
      tx3.mutate(() => collection.delete(`2`))

      await Promise.all([
        tx1.isPersisted.promise,
        tx2.isPersisted.promise,
        tx3.isPersisted.promise,
      ])

      // Wait a bit for sync to complete and indexes to update
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that indexes are updated after sync
      expect(ageIndex.indexedKeys.size).toBe(5) // 5 original - 1 deleted + 1 inserted

      // Test that index-optimized queries work with the updated data
      withIndexTracking(collection, (tracker) => {
        const result = collection.currentStateAsChanges({
          where: (row) => gte(row.age, 50),
        })

        // Should find items with age >= 50 using index
        expect(result.length).toBeGreaterThanOrEqual(1)

        // Verify it used the index
        expectIndexUsage(tracker.stats, {
          shouldUseIndex: true,
          shouldUseFullScan: false,
          indexCallCount: 1,
          fullScanCallCount: 0,
        })
      })
    })
  })
})
