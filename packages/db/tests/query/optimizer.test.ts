import { describe, expect, test } from "vitest"
import { optimizeQuery } from "../../src/query/optimizer.js"
import {
  Aggregate,
  CollectionRef,
  Func,
  PropRef,
  QueryRef,
  Value,
} from "../../src/query/ir.js"
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

function createLt(left: any, right: any) {
  return new Func(`lt`, [left, right])
}

function createAnd(...args: Array<any>) {
  return new Func(`and`, args)
}

function createOr(...args: Array<any>) {
  return new Func(`or`, args)
}

function createAgg(name: string, ...args: Array<any>) {
  return new Aggregate(name, args)
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

    test(`should handle deeply nested AND clauses`, () => {
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
            createAnd(
              createEq(createPropRef(`u`, `department_id`), createValue(1)),
              createGt(createPropRef(`u`, `id`), createValue(100))
            ),
            createLt(createPropRef(`u`, `age`), createValue(65))
          ),
        ],
      }

      const optimized = optimizeQuery(query)

      // The main query should have no where clauses
      expect(optimized.where).toEqual([])

      // The from should be a QueryRef with all three conditions combined
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        const whereClause = optimized.from.query.where![0]
        expect(whereClause).toBeDefined()
        expect((whereClause as any).type).toBe(`func`)
        expect((whereClause as any).name).toBe(`and`)
        expect((whereClause as any).args).toHaveLength(3)
      }
    })
  })

  describe(`Edge Cases and Advanced Scenarios`, () => {
    test(`should handle queries with all optional fields populated`, () => {
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
        select: {
          name: createPropRef(`u`, `name`),
          title: createPropRef(`p`, `title`),
        },
        groupBy: [createPropRef(`u`, `department_id`)],
        having: [
          createGt(
            createAgg(`count`, createPropRef(`p`, `id`)),
            createValue(5)
          ),
        ],
        orderBy: [{ expression: createPropRef(`u`, `name`), direction: `asc` }],
        limit: 10,
        offset: 5,
        fnSelect: () => ({ name: `test` }),
        fnWhere: [() => true],
        fnHaving: [() => true],
      }

      const optimized = optimizeQuery(query)

      // All fields should be preserved
      expect(optimized.select).toEqual(query.select)
      expect(optimized.groupBy).toEqual(query.groupBy)
      expect(optimized.having).toEqual(query.having)
      expect(optimized.orderBy).toEqual(query.orderBy)
      expect(optimized.limit).toEqual(query.limit)
      expect(optimized.offset).toEqual(query.offset)
      expect(optimized.fnSelect).toEqual(query.fnSelect)
      expect(optimized.fnWhere).toEqual(query.fnWhere)
      expect(optimized.fnHaving).toEqual(query.fnHaving)

      // WHERE clause should be moved to subquery
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
    })

    test(`should handle constant expressions (zero sources)`, () => {
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
          createEq(createValue(1), createValue(1)), // Constant expression
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
        ],
      }

      const optimized = optimizeQuery(query)

      // The constant expression should be ignored, single-source clause should be optimized
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle aggregate expressions in WHERE clauses`, () => {
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
          createGt(
            createAgg(`count`, createPropRef(`p`, `id`)),
            createValue(5)
          ),
        ],
      }

      const optimized = optimizeQuery(query)

      // The aggregate expression should be optimized to the posts subquery
      expect(optimized.where).toEqual([])
      expect(optimized.join).toHaveLength(1)
      if (optimized.join && optimized.join.length > 0) {
        const joinClause = optimized.join[0]!
        expect(joinClause.from.type).toBe(`queryRef`)
        if (joinClause.from.type === `queryRef`) {
          expect(joinClause.from.query.where).toHaveLength(1)
          expect(joinClause.from.query.where![0]).toEqual(
            createGt(
              createAgg(`count`, createPropRef(`p`, `id`)),
              createValue(5)
            )
          )
        }
      }
    })

    test(`should handle multiple multi-source clauses`, () => {
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
          createEq(createPropRef(`u`, `id`), createPropRef(`p`, `user_id`)),
          createGt(
            createPropRef(`u`, `created_at`),
            createPropRef(`p`, `created_at`)
          ),
        ],
      }

      const optimized = optimizeQuery(query)

      // Both multi-source clauses should be combined with AND in the main query
      expect(optimized.where).toHaveLength(1)
      const whereClause = optimized.where![0]
      expect((whereClause as any).type).toBe(`func`)
      expect((whereClause as any).name).toBe(`and`)
      expect((whereClause as any).args).toHaveLength(2)
    })

    test(`should handle existing QueryRef with WHERE clauses`, () => {
      const existingSubquery: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
        where: [createGt(createPropRef(`u`, `id`), createValue(50))],
      }

      const query: QueryIR = {
        from: new QueryRef(existingSubquery, `u`),
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

      // The existing subquery should have both WHERE clauses
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(2)
        expect(optimized.from.query.where![0]).toEqual(
          createGt(createPropRef(`u`, `id`), createValue(50))
        )
        expect(optimized.from.query.where![1]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle deeply nested QueryRef structures`, () => {
      const deeplyNestedQuery: QueryIR = {
        from: new QueryRef(
          {
            from: new CollectionRef(mockCollection, `u`),
            where: [createGt(createPropRef(`u`, `id`), createValue(10))],
          },
          `u`
        ),
        where: [createLt(createPropRef(`u`, `age`), createValue(50))],
      }

      const query: QueryIR = {
        from: new QueryRef(deeplyNestedQuery, `u`),
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

      // The deeply nested structure should be preserved and new WHERE clause added
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(2)
        expect(optimized.from.query.from.type).toBe(`queryRef`)
      }
    })

    test(`should handle PropRef with empty path`, () => {
      const emptyPathPropRef = new PropRef([])
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
        where: [createEq(emptyPathPropRef, createValue(1))],
      }

      const optimized = optimizeQuery(query)

      // The empty path PropRef should be treated as a constant (no sources)
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`collectionRef`)
    })

    test(`should handle mixed single-source and multi-source clauses with constants`, () => {
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
          createEq(createPropRef(`u`, `department_id`), createValue(1)), // Single source
          createEq(createPropRef(`u`, `id`), createPropRef(`p`, `user_id`)), // Multi source
          createGt(createPropRef(`p`, `views`), createValue(100)), // Single source
          createEq(createValue(1), createValue(1)), // Constant
        ],
      }

      const optimized = optimizeQuery(query)

      // Multi-source clause should remain in main query
      expect(optimized.where).toHaveLength(1)
      expect(optimized.where![0]).toEqual(
        createEq(createPropRef(`u`, `id`), createPropRef(`p`, `user_id`))
      )

      // Single-source clauses should be moved to subqueries
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
      }

      expect(optimized.join).toHaveLength(1)
      if (optimized.join && optimized.join.length > 0) {
        const joinClause = optimized.join[0]!
        expect(joinClause.from.type).toBe(`queryRef`)
        if (joinClause.from.type === `queryRef`) {
          expect(joinClause.from.query.where).toHaveLength(1)
        }
      }
    })
  })

  describe(`Error Handling`, () => {
    test(`should handle malformed expressions gracefully`, () => {
      const malformedExpression = {
        type: `unknown`,
        value: `test`,
      } as any

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
        where: [malformedExpression],
      }

      const optimized = optimizeQuery(query)

      // Should not crash and should handle the malformed expression gracefully
      expect(optimized).toBeDefined()
      expect(optimized.where).toEqual([])
    })

    test(`should handle PropRef with empty first element`, () => {
      const propRefWithEmptyFirst = new PropRef([``, `name`])
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
          createEq(propRefWithEmptyFirst, createValue(1)),
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
        ],
      }

      const optimized = optimizeQuery(query)

      // PropRef with empty first element should be ignored, other clause should be optimized
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle PropRef with undefined first element`, () => {
      const propRefWithUndefinedFirst = new PropRef([undefined as any, `name`])
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
          createEq(propRefWithUndefinedFirst, createValue(1)),
          createEq(createPropRef(`u`, `department_id`), createValue(1)),
        ],
      }

      const optimized = optimizeQuery(query)

      // PropRef with undefined first element should be ignored, other clause should be optimized
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })
  })

  describe(`Multi-Level Predicate Pushdown`, () => {
    test(`should push WHERE clauses through 2 levels of nested subqueries`, () => {
      // Create a 2-level nested query structure
      const nestedQuery: QueryIR = {
        from: new QueryRef(
          {
            from: new CollectionRef(mockCollection, `u`),
            where: [createGt(createPropRef(`u`, `id`), createValue(10))],
          },
          `u`
        ),
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

      const optimized = optimizeQuery(nestedQuery)

      // The new WHERE clause should be pushed to the nested level
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        // Should have both WHERE clauses at the inner level
        expect(optimized.from.query.where).toHaveLength(2)
        expect(optimized.from.query.where).toContainEqual(
          createGt(createPropRef(`u`, `id`), createValue(10))
        )
        expect(optimized.from.query.where).toContainEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle deeply nested structures progressively`, () => {
      // Create a deeply nested query structure
      const deeplyNestedQuery: QueryIR = {
        from: new QueryRef(
          {
            from: new QueryRef(
              {
                from: new CollectionRef(mockCollection, `u`),
                where: [createGt(createPropRef(`u`, `id`), createValue(10))],
              },
              `u`
            ),
            where: [createLt(createPropRef(`u`, `age`), createValue(50))],
          },
          `u`
        ),
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

      const optimized = optimizeQuery(deeplyNestedQuery)

      // Should at least push the top-level WHERE clause down one level
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        const innerQuery = optimized.from.query
        // The department_id clause should be pushed to this level
        expect(innerQuery.where).toContainEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )

        // The age clause should remain here or be pushed deeper
        expect(innerQuery.where).toContainEqual(
          createLt(createPropRef(`u`, `age`), createValue(50))
        )
      }
    })

    test(`should remove redundant subqueries after optimization`, () => {
      // Create a query with redundant subqueries that become empty after optimization
      const queryWithRedundantSubqueries: QueryIR = {
        from: new QueryRef(
          {
            from: new QueryRef(
              {
                from: new CollectionRef(mockCollection, `u`),
              },
              `u`
            ),
          },
          `u`
        ),
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

      const optimized = optimizeQuery(queryWithRedundantSubqueries)

      // Redundant nested subqueries should be removed, leaving a direct reference to the collection
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.from.type).toBe(`collectionRef`)
        expect(optimized.from.query.where).toHaveLength(1)
        expect(optimized.from.query.where![0]).toEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle mixed single-source and multi-source clauses in nested queries`, () => {
      const nestedQuery: QueryIR = {
        from: new QueryRef(
          {
            from: new CollectionRef(mockCollection, `u`),
            where: [createGt(createPropRef(`u`, `age`), createValue(25))],
          },
          `u`
        ),
        join: [
          {
            from: new QueryRef(
              {
                from: new CollectionRef(mockCollection, `p`),
                where: [createGt(createPropRef(`p`, `views`), createValue(50))],
              },
              `p`
            ),
            type: `inner`,
            left: createPropRef(`u`, `id`),
            right: createPropRef(`p`, `user_id`),
          },
        ],
        where: [
          createEq(createPropRef(`u`, `department_id`), createValue(1)), // Single-source
          createEq(createPropRef(`u`, `id`), createPropRef(`p`, `author_id`)), // Multi-source
          createGt(createPropRef(`p`, `rating`), createValue(4)), // Single-source
        ],
      }

      const optimized = optimizeQuery(nestedQuery)

      // Multi-source clause should remain in main query
      expect(optimized.where).toHaveLength(1)
      expect(optimized.where![0]).toEqual(
        createEq(createPropRef(`u`, `id`), createPropRef(`p`, `author_id`))
      )

      // Single-source clauses should be pushed to their respective subqueries
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.where).toHaveLength(2) // Original + new clause
        expect(optimized.from.query.where).toContainEqual(
          createGt(createPropRef(`u`, `age`), createValue(25))
        )
        expect(optimized.from.query.where).toContainEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }

      expect(optimized.join).toHaveLength(1)
      if (optimized.join && optimized.join.length > 0) {
        const joinClause = optimized.join[0]!
        expect(joinClause.from.type).toBe(`queryRef`)
        if (joinClause.from.type === `queryRef`) {
          expect(joinClause.from.query.where).toHaveLength(2) // Original + new clause
          expect(joinClause.from.query.where).toContainEqual(
            createGt(createPropRef(`p`, `views`), createValue(50))
          )
          expect(joinClause.from.query.where).toContainEqual(
            createGt(createPropRef(`p`, `rating`), createValue(4))
          )
        }
      }
    })

    test(`should preserve non-redundant subqueries with meaningful clauses`, () => {
      const queryWithMeaningfulSubqueries: QueryIR = {
        from: new QueryRef(
          {
            from: new QueryRef(
              {
                from: new CollectionRef(mockCollection, `u`),
                where: [createGt(createPropRef(`u`, `id`), createValue(10))],
              },
              `u`
            ),
            select: { name: createPropRef(`u`, `name`) }, // This makes the subquery non-redundant
          },
          `u`
        ),
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

      const optimized = optimizeQuery(queryWithMeaningfulSubqueries)

      // Should preserve the subquery with SELECT clause and push WHERE clause down at least one level
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        expect(optimized.from.query.select).toBeDefined()
        // The new WHERE clause should be pushed to this level or deeper
        expect(optimized.from.query.where).toContainEqual(
          createEq(createPropRef(`u`, `department_id`), createValue(1))
        )
      }
    })

    test(`should handle convergence detection to prevent infinite recursion`, () => {
      // Create a query that should converge quickly
      const simpleQuery: QueryIR = {
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

      const optimized = optimizeQuery(simpleQuery)

      // Should optimize without infinite recursion
      expect(optimized).toBeDefined()
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
    })

    test(`should respect maximum recursion depth`, () => {
      // This test would be hard to trigger naturally, but we can at least verify
      // the function doesn't crash with deeply nested structures
      let deepQuery: QueryIR = {
        from: new CollectionRef(mockCollection, `u`),
      }

      // Create a very deeply nested structure
      for (let i = 0; i < 15; i++) {
        deepQuery = {
          from: new QueryRef(deepQuery, `u`),
        }
      }

      // Add JOIN and WHERE to make it optimizable
      deepQuery.join = [
        {
          from: new CollectionRef(mockCollection, `p`),
          type: `inner`,
          left: createPropRef(`u`, `id`),
          right: createPropRef(`p`, `user_id`),
        },
      ]
      deepQuery.where = [
        createEq(createPropRef(`u`, `department_id`), createValue(1)),
      ]

      const optimized = optimizeQuery(deepQuery)

      // Should not crash and should produce a valid result
      expect(optimized).toBeDefined()
    })

    test(`should handle complex AND/OR expressions with single-level pushdown`, () => {
      const complexQuery: QueryIR = {
        from: new QueryRef(
          {
            from: new CollectionRef(mockCollection, `u`),
            where: [createGt(createPropRef(`u`, `age`), createValue(18))],
          },
          `u`
        ),
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
            createOr(
              createGt(createPropRef(`u`, `salary`), createValue(50000)),
              createEq(createPropRef(`u`, `role`), createValue(`manager`))
            )
          ),
        ],
      }

      const optimized = optimizeQuery(complexQuery)

      // AND clause should be split and single-source parts pushed down
      expect(optimized.where).toEqual([])
      expect(optimized.from.type).toBe(`queryRef`)
      if (optimized.from.type === `queryRef`) {
        // Should contain the original condition plus the AND clause (which gets split)
        expect(optimized.from.query.where).toContainEqual(
          createGt(createPropRef(`u`, `age`), createValue(18))
        )

        // Should have the AND clause pushed down (may be split into components)
        const whereClausesLength = optimized.from.query.where?.length || 0
        expect(whereClausesLength).toBeGreaterThan(1) // Should have at least the original + new conditions
      }
    })
  })
})
