import { CollectionImpl } from "../../collection.js"
import { CollectionRef, QueryRef, IncludeRef } from "../ir.js"
import { createRefProxy, isRefProxy, toExpression } from "./ref-proxy.js"
import type { NamespacedRow } from "../../types.js"
import type {
  Aggregate,
  BasicExpression,
  IncludeRef,
  JoinClause,
  OrderBy,
  OrderByClause,
  OrderByDirection,
  QueryIR,
} from "../ir.js"
import type {
  Context,
  GroupByCallback,
  JoinOnCallback,
  MergeContext,
  MergeContextWithJoinType,
  OrderByCallback,
  RefProxyForContext,
  ResultTypeFromSelect,
  SchemaFromSource,
  SelectObject,
  Source,
  WhereCallback,
  WithResult,
} from "./types.js"

export class BaseQueryBuilder<TContext extends Context = Context> {
  private readonly query: Partial<QueryIR> = {}

  constructor(query: Partial<QueryIR> = {}) {
    this.query = { ...query }
  }

  /**
   * Creates a CollectionRef or QueryRef from a source object
   * @param source - An object with a single key-value pair
   * @param context - Context string for error messages (e.g., "from clause", "join clause")
   * @returns A tuple of [alias, ref] where alias is the source key and ref is the created reference
   */
  private _createRefForSource<TSource extends Source>(
    source: TSource,
    context: string
  ): [string, CollectionRef | QueryRef] {
    if (Object.keys(source).length !== 1) {
      throw new Error(`Only one source is allowed in the ${context}`)
    }

    const alias = Object.keys(source)[0]!
    const sourceValue = source[alias]

    let ref: CollectionRef | QueryRef

    if (sourceValue instanceof CollectionImpl) {
      ref = new CollectionRef(sourceValue, alias)
    } else if (sourceValue instanceof BaseQueryBuilder) {
      const subQuery = sourceValue._getQuery()
      if (!(subQuery as Partial<QueryIR>).from) {
        throw new Error(
          `A sub query passed to a ${context} must have a from clause itself`
        )
      }
      ref = new QueryRef(subQuery, alias)
    } else {
      throw new Error(`Invalid source`)
    }

    return [alias, ref]
  }

  /**
   * Specify the source table or subquery for the query
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @returns A QueryBuilder with the specified source
   *
   * @example
   * ```ts
   * // Query from a collection
   * query.from({ users: usersCollection })
   *
   * // Query from a subquery
   * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
   * query.from({ activeUsers })
   * ```
   */
  from<TSource extends Source>(
    source: TSource
  ): QueryBuilder<{
    baseSchema: SchemaFromSource<TSource>
    schema: SchemaFromSource<TSource>
    fromSourceName: keyof TSource & string
    hasJoins: false
  }> {
    const [, from] = this._createRefForSource(source, `from clause`)

    return new BaseQueryBuilder({
      ...this.query,
      from,
    }) as any
  }

  /**
   * Join another table or subquery to the current query
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @param type - The type of join: 'inner', 'left', 'right', or 'full' (defaults to 'left')
   * @returns A QueryBuilder with the joined table available
   *
   * @example
   * ```ts
   * // Left join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   *
   * // Inner join with explicit type
   * query
   *   .from({ u: usersCollection })
   *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId), 'inner')
   * ```
   *
   * // Join with a subquery
   * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
   * query
   *   .from({ activeUsers })
   *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId))
   */
  join<
    TSource extends Source,
    TJoinType extends `inner` | `left` | `right` | `full` = `left`,
  >(
    source: TSource,
    onCallback: JoinOnCallback<
      MergeContext<TContext, SchemaFromSource<TSource>>
    >,
    type: TJoinType = `left` as TJoinType
  ): QueryBuilder<
    MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, TJoinType>
  > {
    const [alias, from] = this._createRefForSource(source, `join clause`)

    // Create a temporary context for the callback
    const currentAliases = this._getCurrentAliases()
    const newAliases = [...currentAliases, alias]
    const refProxy = createRefProxy(newAliases) as RefProxyForContext<
      MergeContext<TContext, SchemaFromSource<TSource>>
    >

    // Get the join condition expression
    const onExpression = onCallback(refProxy)

    // Extract left and right from the expression
    // For now, we'll assume it's an eq function with two arguments
    let left: BasicExpression
    let right: BasicExpression

    if (
      onExpression.type === `func` &&
      onExpression.name === `eq` &&
      onExpression.args.length === 2
    ) {
      left = onExpression.args[0]!
      right = onExpression.args[1]!
    } else {
      throw new Error(`Join condition must be an equality expression`)
    }

    const joinClause: JoinClause = {
      from,
      type,
      left,
      right,
    }

    const existingJoins = this.query.join || []

    return new BaseQueryBuilder({
      ...this.query,
      join: [...existingJoins, joinClause],
    }) as any
  }

  /**
   * Filter rows based on a condition
   *
   * @param callback - A function that receives table references and returns an expression
   * @returns A QueryBuilder with the where condition applied
   *
   * @example
   * ```ts
   * // Simple condition
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => gt(users.age, 18))
   *
   * // Multiple conditions
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => and(
   *     gt(users.age, 18),
   *     eq(users.active, true)
   *   ))
   *
   * // Multiple where calls are ANDed together
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => gt(users.age, 18))
   *   .where(({users}) => eq(users.active, true))
   * ```
   */
  where(callback: WhereCallback<TContext>): QueryBuilder<TContext> {
    const aliases = this._getCurrentAliases()
    const refProxy = createRefProxy(aliases) as RefProxyForContext<TContext>
    const expression = callback(refProxy)

    const existingWhere = this.query.where || []

    return new BaseQueryBuilder({
      ...this.query,
      where: [...existingWhere, expression],
    }) as any
  }

  /**
   * Filter grouped rows based on aggregate conditions
   *
   * @param callback - A function that receives table references and returns an expression
   * @returns A QueryBuilder with the having condition applied
   *
   * @example
   * ```ts
   * // Filter groups by count
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .having(({posts}) => gt(count(posts.id), 5))
   *
   * // Filter by average
   * query
   *   .from({ orders: ordersCollection })
   *   .groupBy(({orders}) => orders.customerId)
   *   .having(({orders}) => gt(avg(orders.total), 100))
   *
   * // Multiple having calls are ANDed together
   * query
   *   .from({ orders: ordersCollection })
   *   .groupBy(({orders}) => orders.customerId)
   *   .having(({orders}) => gt(count(orders.id), 5))
   *   .having(({orders}) => gt(avg(orders.total), 100))
   * ```
   */
  having(callback: WhereCallback<TContext>): QueryBuilder<TContext> {
    const aliases = this._getCurrentAliases()
    const refProxy = createRefProxy(aliases) as RefProxyForContext<TContext>
    const expression = callback(refProxy)

    const existingHaving = this.query.having || []

    return new BaseQueryBuilder({
      ...this.query,
      having: [...existingHaving, expression],
    }) as any
  }

  /**
   * Select specific columns or computed values from the query
   *
   * @param callback - A function that receives table references and returns an object with selected fields or expressions
   * @returns A QueryBuilder that returns only the selected fields
   *
   * @example
   * ```ts
   * // Select specific columns
   * query
   *   .from({ users: usersCollection })
   *   .select(({users}) => ({
   *     name: users.name,
   *     email: users.email
   *   }))
   *
   * // Select with computed values
   * query
   *   .from({ users: usersCollection })
   *   .select(({users}) => ({
   *     fullName: concat(users.firstName, ' ', users.lastName),
   *     ageInMonths: mul(users.age, 12)
   *   }))
   *
   * // Select with aggregates (requires GROUP BY)
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .select(({posts, count}) => ({
   *     userId: posts.userId,
   *     postCount: count(posts.id)
   *   }))
   * ```
   */
  select<TSelectObject extends SelectObject>(
    callback: (refs: RefProxyForContext<TContext>) => TSelectObject
  ): QueryBuilder<WithResult<TContext, ResultTypeFromSelect<TSelectObject>>> {
    const aliases = this._getCurrentAliases()
    const refProxy = createRefProxy(aliases) as RefProxyForContext<TContext>
    const selectObject = callback(refProxy)

    // Check if any tables were spread during the callback
    const spreadSentinels = (refProxy as any).__spreadSentinels as Set<string>

    // Convert the select object to use expressions, including spread sentinels
    const select: Record<string, BasicExpression | Aggregate | IncludeRef> = {}

    // First, add spread sentinels for any tables that were spread
    for (const spreadAlias of spreadSentinels) {
      const sentinelKey = `__SPREAD_SENTINEL__${spreadAlias}`
      select[sentinelKey] = toExpression(spreadAlias) // Use alias as a simple reference
    }

    // Then add the explicit select fields
    for (const [key, value] of Object.entries(selectObject)) {
      if (isRefProxy(value)) {
        select[key] = toExpression(value)
      } else if (
        typeof value === `object` &&
        `type` in value &&
        (value.type === `agg` || value.type === `func`)
      ) {
        select[key] = value as BasicExpression | Aggregate
      } else if (value instanceof BaseQueryBuilder) {
        // Handle nested queries - create an IncludeRef
        const nestedQuery = value._getQuery()
        if (!nestedQuery.from) {
          throw new Error(`Nested query must have a from clause`)
        }
        
        // For now, we'll create a simple IncludeRef without foreign key mapping
        // This will be enhanced in the optimizer to extract the relationship
        select[key] = new IncludeRef(
          nestedQuery,
          key,
          [], // foreignKeyPath - will be determined by optimizer
          []  // localKeyPath - will be determined by optimizer
        )
      } else {
        select[key] = toExpression(value)
      }
    }

    return new BaseQueryBuilder({
      ...this.query,
      select,
      fnSelect: undefined, // remove the fnSelect clause if it exists
    }) as any
  }

  /**
   * Sort the query results by one or more columns
   *
   * @param callback - A function that receives table references and returns the field to sort by
   * @param direction - Sort direction: 'asc' for ascending, 'desc' for descending (defaults to 'asc')
   * @returns A QueryBuilder with the ordering applied
   *
   * @example
   * ```ts
   * // Sort by a single column
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.name)
   *
   * // Sort descending
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.createdAt, 'desc')
   *
   * // Multiple sorts (chain orderBy calls)
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.lastName)
   *   .orderBy(({users}) => users.firstName)
   * ```
   */
  orderBy(
    callback: OrderByCallback<TContext>,
    direction: OrderByDirection = `asc`
  ): QueryBuilder<TContext> {
    const aliases = this._getCurrentAliases()
    const refProxy = createRefProxy(aliases) as RefProxyForContext<TContext>
    const result = callback(refProxy)

    // Create the new OrderBy structure with expression and direction
    const orderByClause: OrderByClause = {
      expression: toExpression(result),
      direction,
    }

    const existingOrderBy: OrderBy = this.query.orderBy || []

    return new BaseQueryBuilder({
      ...this.query,
      orderBy: [...existingOrderBy, orderByClause],
    }) as any
  }

  /**
   * Group rows by one or more columns for aggregation
   *
   * @param callback - A function that receives table references and returns the field(s) to group by
   * @returns A QueryBuilder with grouping applied (enables aggregate functions in SELECT and HAVING)
   *
   * @example
   * ```ts
   * // Group by a single column
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .select(({posts, count}) => ({
   *     userId: posts.userId,
   *     postCount: count()
   *   }))
   *
   * // Group by multiple columns
   * query
   *   .from({ sales: salesCollection })
   *   .groupBy(({sales}) => [sales.region, sales.category])
   *   .select(({sales, sum}) => ({
   *     region: sales.region,
   *     category: sales.category,
   *     totalSales: sum(sales.amount)
   *   }))
   * ```
   */
  groupBy(callback: GroupByCallback<TContext>): QueryBuilder<TContext> {
    const aliases = this._getCurrentAliases()
    const refProxy = createRefProxy(aliases) as RefProxyForContext<TContext>
    const result = callback(refProxy)

    const newExpressions = Array.isArray(result)
      ? result.map((r) => toExpression(r))
      : [toExpression(result)]

    // Replace existing groupBy expressions instead of extending them
    return new BaseQueryBuilder({
      ...this.query,
      groupBy: newExpressions,
    }) as any
  }

  /**
   * Limit the number of rows returned by the query
   * `orderBy` is required for `limit`
   *
   * @param count - Maximum number of rows to return
   * @returns A QueryBuilder with the limit applied
   *
   * @example
   * ```ts
   * // Get top 5 posts by likes
   * query
   *   .from({ posts: postsCollection })
   *   .orderBy(({posts}) => posts.likes, 'desc')
   *   .limit(5)
   * ```
   */
  limit(count: number): QueryBuilder<TContext> {
    return new BaseQueryBuilder({
      ...this.query,
      limit: count,
    }) as any
  }

  /**
   * Skip a number of rows before returning results
   * `orderBy` is required for `offset`
   *
   * @param count - Number of rows to skip
   * @returns A QueryBuilder with the offset applied
   *
   * @example
   * ```ts
   * // Get second page of results
   * query
   *   .from({ posts: postsCollection })
   *   .orderBy(({posts}) => posts.createdAt, 'desc')
   *   .offset(page * pageSize)
   *   .limit(pageSize)
   * ```
   */
  offset(count: number): QueryBuilder<TContext> {
    return new BaseQueryBuilder({
      ...this.query,
      offset: count,
    }) as any
  }

  // Helper methods
  private _getCurrentAliases(): Array<string> {
    const aliases: Array<string> = []

    // Add the from alias
    if (this.query.from) {
      aliases.push(this.query.from.alias)
    }

    // Add join aliases
    if (this.query.join) {
      for (const join of this.query.join) {
        aliases.push(join.from.alias)
      }
    }

    return aliases
  }

  /**
   * Functional variants of the query builder
   * These are imperative function that are called for ery row.
   * Warning: that these cannot be optimized by the query compiler, and may prevent
   * some type of optimizations being possible.
   * @example
   * ```ts
   * q.fn.select((row) => ({
   *   name: row.user.name.toUpperCase(),
   *   age: row.user.age + 1,
   * }))
   * ```
   */
  get fn() {
    const builder = this
    return {
      /**
       * Select fields using a function that operates on each row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives a row and returns the selected value
       * @returns A QueryBuilder with functional selection applied
       *
       * @example
       * ```ts
       * // Functional select (not optimized)
       * query
       *   .from({ users: usersCollection })
       *   .fn.select(row => ({
       *     name: row.users.name.toUpperCase(),
       *     age: row.users.age + 1,
       *   }))
       * ```
       */
      select<TFuncSelectResult>(
        callback: (row: TContext[`schema`]) => TFuncSelectResult
      ): QueryBuilder<WithResult<TContext, TFuncSelectResult>> {
        return new BaseQueryBuilder({
          ...builder.query,
          select: undefined, // remove the select clause if it exists
          fnSelect: callback,
        })
      },
      /**
       * Filter rows using a function that operates on each row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives a row and returns a boolean
       * @returns A QueryBuilder with functional filtering applied
       *
       * @example
       * ```ts
       * // Functional where (not optimized)
       * query
       *   .from({ users: usersCollection })
       *   .fn.where(row => row.users.name.startsWith('A'))
       * ```
       */
      where(
        callback: (row: TContext[`schema`]) => any
      ): QueryBuilder<TContext> {
        return new BaseQueryBuilder({
          ...builder.query,
          fnWhere: [
            ...(builder.query.fnWhere || []),
            callback as (row: NamespacedRow) => any,
          ],
        })
      },
      /**
       * Filter grouped rows using a function that operates on each aggregated row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives an aggregated row and returns a boolean
       * @returns A QueryBuilder with functional having filter applied
       *
       * @example
       * ```ts
       * // Functional having (not optimized)
       * query
       *   .from({ posts: postsCollection })
       *   .groupBy(({posts}) => posts.userId)
       *   .fn.having(row => row.count > 5)
       * ```
       */
      having(
        callback: (row: TContext[`schema`]) => any
      ): QueryBuilder<TContext> {
        return new BaseQueryBuilder({
          ...builder.query,
          fnHaving: [
            ...(builder.query.fnHaving || []),
            callback as (row: NamespacedRow) => any,
          ],
        })
      },
    }
  }

  _getQuery(): QueryIR {
    if (!this.query.from) {
      throw new Error(`Query must have a from clause`)
    }
    return this.query as QueryIR
  }
}

// Internal function to build a query from a callback
// used by liveQueryCollectionOptions.query
export function buildQuery<TContext extends Context>(
  fn: (builder: InitialQueryBuilder) => QueryBuilder<TContext>
): QueryIR {
  const result = fn(new BaseQueryBuilder())
  return getQueryIR(result)
}

// Internal function to get the QueryIR from a builder
export function getQueryIR(
  builder: BaseQueryBuilder | QueryBuilder<any> | InitialQueryBuilder
): QueryIR {
  return (builder as unknown as BaseQueryBuilder)._getQuery()
}

// Type-only exports for the query builder
export type InitialQueryBuilder = Pick<BaseQueryBuilder<Context>, `from`>

export type InitialQueryBuilderConstructor = new () => InitialQueryBuilder

export type QueryBuilder<TContext extends Context> = Omit<
  BaseQueryBuilder<TContext>,
  `from` | `_getQuery`
>

// Main query builder class alias with the constructor type modified to hide all
// but the from method on the initial instance
export const Query: InitialQueryBuilderConstructor = BaseQueryBuilder

// Helper type to extract context from a QueryBuilder
export type ExtractContext<T> =
  T extends BaseQueryBuilder<infer TContext>
    ? TContext
    : T extends QueryBuilder<infer TContext>
      ? TContext
      : never

// Export the types from types.ts for convenience
export type { Context, Source, GetResult } from "./types.js"
