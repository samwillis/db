import { describe, expect, test } from "vitest"
import { optimizeQuery } from "../../src/query/optimizer.js"
import { CollectionRef, Func, PropRef, Value } from "../../src/query/ir.js"
import type { QueryIR } from "../../src/query/ir.js"

// Mock collection for testing
const mockCollection = {
  id: `test-collection`,
} as any

// Helper functions to create test expressions
function createPropRef(alias: string, prop: string) {
  return new PropRef([alias, prop])
}

function createValue(value: any) {
  return new Value(value)
}

function createEq(left: any, right: any) {
  return new Func(`eq`, [left, right])
}

function createGt(left: any, right: any) {
  return new Func(`gt`, [left, right])
}

function createAnd(...args: Array<any>) {
  return new Func(`and`, args)
}

function createOr(...args: Array<any>) {
  return new Func(`or`, args)
}

describe(`Query Optimizer`, () => {
  describe(`Basic Optimization`, () => {
    test(`should pass through queries without where clauses`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
      }

      const optimized = optimizeQuery(query)
      expect(optimized).toEqual(query)
    })

    test(`should pass through queries with empty where clauses`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        where: [],
      }

      const optimized = optimizeQuery(query)
      expect(optimized).toEqual(query)
    })

    test(`should skip optimization for queries without joins`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        where: [createEq(createPropRef(`u`, `department_id`), createValue(1))],
      }

      const optimized = optimizeQuery(query)
      // Query should remain unchanged since there are no joins to optimize
      expect(optimized).toEqual(query)
    })
  })

  describe(`Single Source Optimization with Joins`, () => {
    test(`should lift single-source where clause into subquery when joins are present`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [createEq(createPropRef(`u`, `department_id`), createValue(1))],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // The from should be a QueryRef with the lifted where clause
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should lift multiple single-source where clauses into subquery when joins are present`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
          createGt(createPropRef(`u`, `id`), createValue(100)),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // The from should be a QueryRef with the combined where clause
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        const whereClause = optimized.from.query.where![0]
        expect(whereClause).toBeDefined()
        expect((whereClause as any).type).toBe(`func`)
        expect((whereClause as any).name).toBe(`and`)
      }
    })
  })

  describe(`Join Optimization`, () => {
    test(`should lift single-source where clauses into join subqueries`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
          createGt(createPropRef(`p`, `views`), createValue(100)),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // Both from and join should be QueryRefs with lifted where clauses
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }

      expect(optimized.join).toHaveLength(1)
      if (optimized.join && optimized.join.length > 0) {
        const joinClause = optimized.join[0]!
        expect(joinClause.from.type).toBe(`queryRef`)
        if (joinClause.from.type === `queryRef`) {
          expect(joinClause.from.query.where).toHaveLength(1)
          if (joinClause.from.query.where) {
            expect(joinClause.from.query.where[0]).toEqual(
              createGt(createPropRef(`p`, `views`), createValue(100))
            )
          }
        }
      }
    })

    test(`should preserve multi-source where clauses`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
          createEq(createPropRef(`u`, `id`), createPropRef(`p`, `user_id`)),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have the multi-source where clause
      expect(optimized.where).toHaveLength(1)
      expect(optimized.where![0]).toEqual(
        createEq(createPropRef(`u`, `id`), createPropRef(`p`, `user_id`))
      )

      // The from should be a QueryRef with the single-source where clause
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })
  })

  describe(`AND/OR Splitting with Joins`, () => {
    test(`should split AND clauses at the root level when joins are present`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createAnd(
            createEq(createPropRef(`u`, `department_id`), createValue(1)),
            createGt(createPropRef(`u`, `id`), createValue(100))
          ),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // The from should be a QueryRef with the combined where clause
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        const whereClause = optimized.from.query.where![0]
        expect(whereClause).toBeDefined()
        expect((whereClause as any).type).toBe(`func`)
        expect((whereClause as any).name).toBe(`and`)
      }
    })

    test(`should not split OR clauses at the root level when joins are present`, () => {
      const query: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        join: [
          {
            from: new CollectionRef(mockCollection, `p`),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createOr(
            createEq(createPropRef(`u`, `department_id`), createValue(1)),
            createEq(createPropRef(`u`, `department_id`), createValue(2))
          ),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // The from should be a QueryRef with the OR clause
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        const whereClause = optimized.from.query.where![0]
        expect(whereClause).toBeDefined()
        expect((whereClause as any).type).toBe(`func`)
        expect((whereClause as any).name).toBe(`or`)
      }
    })
  })
})
