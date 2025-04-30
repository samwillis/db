import { describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"
import mitt from "mitt"
import { Collection } from "../src/collection"
import type {
  ChangeMessage,
  ChangesPayload,
  PendingMutation,
} from "../src/types"

// Define custom event types for mitt
type Events = {
  sync: Array<ChangeMessage<any>> | Array<PendingMutation>
  testEvent: Array<ChangeMessage<{ value: string }>>
}

// Helper function to wait for changes to be processed
const waitForChanges = () => new Promise((resolve) => setTimeout(resolve, 10))

describe(`Collection.subscribeChanges`, () => {
  it(`should emit initial collection state as insert changes`, async () => {
    const callback = vi.fn()

    // Create collection with pre-populated data
    const collection = new Collection<{ value: string }>({
      id: `initial-state-test`,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Immediately populate with initial data
          begin()
          write({
            type: `insert`,
            key: `item1`,
            value: { value: `value1` },
          })
          write({
            type: `insert`,
            key: `item2`,
            value: { value: `value2` },
          })
          commit()
        },
      },
      mutationFn: {
        persist: async () => {},
      },
    })

    // Wait for initial sync to complete
    await waitForChanges()

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // Verify that callback was called with initial state
    expect(callback).toHaveBeenCalledTimes(1)
    const payload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(payload.changes).toHaveLength(2)

    // Check that both items were emitted as inserts
    if (payload.changes.length > 0) {
      const insertedKeys = payload.changes.map((change) => change.key)
      expect(insertedKeys).toContain(`item1`)
      expect(insertedKeys).toContain(`item2`)
    }

    // Ensure all changes are insert type
    expect(payload.changes.every((change) => change.type === `insert`)).toBe(
      true
    )

    // Clean up
    unsubscribe()
  })

  it(`should emit changes from synced operations using mitt emitter`, async () => {
    const emitter = mitt<Events>()
    const callback = vi.fn()

    // Create collection with sync capability using the mitt pattern from collection.test.ts
    const collection = new Collection<{ value: string }>({
      id: `sync-changes-test-with-mitt`,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Setup a listener for our test events
          emitter.on(`testEvent`, (changes) => {
            begin()
            if (Array.isArray(changes)) {
              changes.forEach((change) => write(change))
            }
            commit()
          })

          // Start with empty data
          begin()
          commit()
        },
      },
      mutationFn: {
        persist: async () => {},
      },
    })

    // Wait for initial sync to complete
    await waitForChanges()

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // Reset mock to ignore initial state emission
    callback.mockReset()

    // Emit a sync insert change
    emitter.emit(`testEvent`, [
      {
        type: `insert`,
        key: `syncItem1`,
        value: { value: `sync value 1` },
      },
    ])

    // Wait for changes to propagate
    await waitForChanges()

    // Verify that insert was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const insertPayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(insertPayload.changes).toHaveLength(1)

    if (insertPayload.changes.length > 0) {
      const insertChange = insertPayload.changes[0]! as ChangeMessage<{
        value: string
      }>
      expect(insertChange).toBeDefined()
      expect(insertChange.type).toBe(`insert`)
      expect(insertChange.key).toBe(`syncItem1`)
      expect(insertChange.value).toEqual({ value: `sync value 1` })
    }

    // Reset mock
    callback.mockReset()

    // Emit a sync update change
    emitter.emit(`testEvent`, [
      {
        type: `update`,
        key: `syncItem1`,
        value: { value: `updated sync value` },
      },
    ])

    // Wait for changes to propagate
    await waitForChanges()

    // Verify that update was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const updatePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(updatePayload.changes).toHaveLength(1)

    const updateChange = updatePayload.changes[0]! as ChangeMessage<{
      value: string
    }>
    expect(updateChange).toBeDefined()
    expect(updateChange.type).toBe(`update`)
    expect(updateChange.key).toBe(`syncItem1`)
    expect(updateChange.value).toEqual({ value: `updated sync value` })

    // Reset mock
    callback.mockReset()

    // Emit a sync delete change
    emitter.emit(`testEvent`, [
      {
        type: `delete`,
        key: `syncItem1`,
        value: { value: `updated sync value` },
      },
    ])

    // Wait for changes to propagate
    await waitForChanges()

    // Verify that delete was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const deletePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(deletePayload.changes).toHaveLength(1)

    const deleteChange = deletePayload.changes[0]! as ChangeMessage<{
      value: string
    }>
    expect(deleteChange).toBeDefined()
    expect(deleteChange.type).toBe(`delete`)
    expect(deleteChange.key).toBe(`syncItem1`)

    // Clean up
    unsubscribe()
  })

  it(`should emit changes from optimistic operations`, async () => {
    const emitter = mitt<Events>()
    const callback = vi.fn()

    // Create collection with mutation capability
    const collection = new Collection<{ value: string; updated?: boolean }>({
      id: `optimistic-changes-test`,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Listen for sync events
          emitter.on(`sync`, (mutations) => {
            begin()
            const pendingMutations = mutations as Array<PendingMutation>
            pendingMutations.forEach((mutation) => {
              write({
                key: mutation.key,
                type: mutation.type,
                value: mutation.changes as { value: string; updated?: boolean },
              })
            })
            commit()
          })
        },
      },
      mutationFn: {
        persist: async () => {},
        awaitSync({ transaction }) {
          emitter.emit(`sync`, transaction.mutations)
          return Promise.resolve()
        },
      },
    })

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // Reset mock to ignore initial state emission
    callback.mockReset()

    // Perform optimistic insert
    collection.insert({ value: `optimistic value` }, { key: `optimisticItem` })

    // Verify that insert was emitted immediately (optimistically)
    expect(callback).toHaveBeenCalledTimes(1)
    const insertPayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(insertPayload.changes).toHaveLength(1)

    if (insertPayload.changes.length > 0) {
      const insertChange = insertPayload.changes[0]! as ChangeMessage<{
        value: string
      }>
      expect(insertChange).toBeDefined()
      expect(insertChange).toEqual({
        type: `insert`,
        key: `optimisticItem`,
        value: { value: `optimistic value` },
      })
    }

    // Reset mock
    callback.mockReset()

    // Perform optimistic update
    const item = collection.state.get(`optimisticItem`)
    if (!item) {
      throw new Error(`Item not found`)
    }
    collection.update(item, (draft) => {
      draft.value = `updated optimistic value`
      draft.updated = true
    })

    // Verify that update was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const updatePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
      updated?: boolean
    }>
    expect(updatePayload.changes).toHaveLength(1)

    const updateChange = updatePayload.changes[0]! as ChangeMessage<{
      value: string
      updated?: boolean
    }>
    expect(updateChange).toBeDefined()
    expect(updateChange.type).toBe(`update`)
    expect(updateChange.key).toBe(`optimisticItem`)
    expect(updateChange.value).toEqual({
      value: `updated optimistic value`,
      updated: true,
    })

    // Reset mock
    callback.mockReset()

    // Perform optimistic delete
    collection.delete(`optimisticItem`)

    // Verify that delete was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const deletePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(deletePayload.changes).toHaveLength(1)

    const deleteChange = deletePayload.changes[0]! as ChangeMessage<{
      value: string
    }>
    expect(deleteChange).toBeDefined()
    expect(deleteChange.type).toBe(`delete`)
    expect(deleteChange.key).toBe(`optimisticItem`)

    // Clean up
    unsubscribe()
  })

  it(`should handle both synced and optimistic changes together`, async () => {
    const emitter = mitt<Events>()
    const callback = vi.fn()

    // Create collection with both sync and mutation capabilities
    const collection = new Collection<{ value: string }>({
      id: `mixed-changes-test`,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Setup a listener for our test events
          emitter.on(`testEvent`, (changes) => {
            begin()
            if (Array.isArray(changes)) {
              changes.forEach((change) => write(change))
            }
            commit()
          })

          // Start with empty data
          begin()
          commit()
        },
      },
      mutationFn: {
        persist: async () => {},
      },
    })

    // Wait for initial sync to complete
    await waitForChanges()

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // Reset mock to ignore initial state emission
    callback.mockReset()

    // First add a synced item
    emitter.emit(`testEvent`, [
      {
        type: `insert`,
        key: `syncedItem`,
        value: { value: `synced value` },
      },
    ])

    // Wait for changes to propagate
    await waitForChanges()

    // Verify synced insert was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    callback.mockReset()

    // Now add an optimistic item
    collection.insert({ value: `optimistic value` }, { key: `optimisticItem` })

    // Verify optimistic insert was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    callback.mockReset()

    // Update both items in optimistic and synced ways
    // First update the optimistic item optimistically
    const optItem = collection.state.get(`optimisticItem`)
    if (optItem) {
      collection.update(optItem, (draft) => {
        draft.value = `updated optimistic value`
      })
    }

    // Verify the optimistic update was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    callback.mockReset()

    // Then update the synced item with a synced update
    emitter.emit(`testEvent`, [
      {
        type: `update`,
        key: `syncedItem`,
        value: { value: `updated synced value` },
      },
    ])

    // Wait for changes to propagate
    await waitForChanges()

    // Verify the synced update was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const updatePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>

    const updateChange = updatePayload.changes[0]! as ChangeMessage<{
      value: string
    }>
    expect(updateChange).toBeDefined()
    expect(updateChange.type).toBe(`update`)
    expect(updateChange.key).toBe(`syncedItem`)
    expect(updateChange.value).toEqual({ value: `updated synced value` })

    // Clean up
    unsubscribe()
  })

  it(`should only emit differences between states, not whole state`, async () => {
    const emitter = mitt<Events>()
    const callback = vi.fn()

    // Create collection with initial data
    const collection = new Collection<{ value: string }>({
      id: `diff-changes-test`,
      sync: {
        sync: ({ begin, write, commit }) => {
          // Immediately populate with initial data
          begin()
          write({
            type: `insert`,
            key: `item1`,
            value: { value: `value1` },
          })
          write({
            type: `insert`,
            key: `item2`,
            value: { value: `value2` },
          })
          commit()

          // Listen for sync events
          emitter.on(`sync`, (operations) => {
            begin()
            const changeOperations = operations as Array<
              ChangeMessage<{ value: string }>
            >
            changeOperations.forEach((op) => write(op))
            commit()
          })
        },
      },
      mutationFn: {
        persist: async () => {},
        awaitSync({ transaction }) {
          emitter.emit(`sync`, transaction.mutations)
          return Promise.resolve()
        },
      },
    })

    // Wait for initial sync to complete
    await waitForChanges()

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // First call should have initial state (2 items)
    expect(callback).toHaveBeenCalledTimes(1)
    const initialPayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(initialPayload.changes).toHaveLength(2)

    // Reset mock
    callback.mockReset()

    // Insert multiple items at once
    collection.insert([
      { value: `batch1` },
      { value: `batch2` },
      { value: `batch3` },
    ])

    // Verify only the 3 new items were emitted, not the existing ones
    expect(callback).toHaveBeenCalledTimes(1)
    const batchPayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(batchPayload.changes).toHaveLength(3)
    expect(
      batchPayload.changes.every((change) => change.type === `insert`)
    ).toBe(true)

    // Reset mock
    callback.mockReset()

    // Update one item only
    const itemToUpdate = collection.state.get(`item1`)
    if (!itemToUpdate) {
      throw new Error(`Item not found`)
    }
    collection.update(itemToUpdate, (draft) => {
      draft.value = `updated value`
    })

    // Verify only the updated item was emitted
    expect(callback).toHaveBeenCalledTimes(1)
    const updatePayload = callback.mock.calls[0]![0] as ChangesPayload<{
      value: string
    }>
    expect(updatePayload.changes).toHaveLength(1)

    const updateChange = updatePayload.changes[0]! as ChangeMessage<{
      value: string
    }>
    expect(updateChange).toBeDefined()
    expect(updateChange.type).toBe(`update`)
    expect(updateChange.key).toBe(`item1`)

    // Clean up
    unsubscribe()
  })

  it(`should correctly unsubscribe when returned function is called`, async () => {
    const callback = vi.fn()

    // Create collection
    const collection = new Collection<{ value: string }>({
      id: `unsubscribe-test`,
      sync: {
        sync: ({ begin, commit }) => {
          begin()
          commit()
        },
      },
      mutationFn: {
        persist: async () => {},
      },
    })

    // Subscribe to changes
    const unsubscribe = collection.subscribeChanges(callback)

    // Initial state emission
    expect(callback).toHaveBeenCalledTimes(1)

    // Reset mock
    callback.mockReset()

    // Unsubscribe
    unsubscribe()

    // Insert an item
    collection.insert({ value: `test value` })

    // Callback shouldn't be called after unsubscribe
    expect(callback).not.toHaveBeenCalled()
  })
})
