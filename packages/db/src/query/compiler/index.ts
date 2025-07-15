import { filter, map } from "@electric-sql/d2mini"
import { compileExpression } from "./evaluators.js"
import { processJoins } from "./joins.js"
import { processGroupBy } from "./group-by.js"
import { processOrderBy } from "./order-by.js"
import { processSelectToResults } from "./select.js"
import { optimizeQuery } from "../optimizer.js"
import type { CollectionRef, QueryIR, QueryRef } from "../ir.js"
import type {
  KeyedStream,
  NamespacedAndKeyedStream,
  ResultStream,
} from "../../types.js"

/**
 * Cache for compiled subqueries to avoid duplicate compilation
 */
type QueryCache = WeakMap<QueryIR, ResultStream>

/**
 * Compiles a query2 IR into a D2 pipeline
 * @param query The query IR to compile
 * @param inputs Mapping of collection names to input streams
 * @param cache Optional cache for compiled subqueries (used internally for recursion)
 * @returns A stream builder representing the compiled query
 */
export function compileQuery(
  query: QueryIR,
  inputs: Record<string, KeyedStream>,
  cache: QueryCache = new WeakMap()
): ResultStream {
  // Check if this query has already been compiled
  const cachedResult = cache.get(query)
  if (cachedResult) {
    return cachedResult
  }

  // Optimize the query to convert includes to joins where possible
  const optimizedQuery = optimizeQuery(query)

  // Create a copy of the inputs map to avoid modifying the original
  const allInputs = { ...inputs }

  // Create a map of table aliases to inputs
  const tables: Record<string, KeyedStream> = {}

  // Process the FROM clause to get the main table
  const { alias: mainTableAlias, input: mainInput } = processFrom(
    optimizedQuery.from,
    allInputs,
    cache
  )
  tables[mainTableAlias] = mainInput

  // Prepare the initial pipeline with the main table wrapped in its alias
  let pipeline: NamespacedAndKeyedStream = mainInput.pipe(
    map(([key, row]) => {
      // Initialize the record with a nested structure
      const ret = [key, { [mainTableAlias]: row }] as [
        string,
        Record<string, typeof row>,
      ]
      return ret
    })
  )

  // Process JOIN clauses if they exist
  if (optimizedQuery.join && optimizedQuery.join.length > 0) {
    pipeline = processJoins(
      pipeline,
      optimizedQuery.join,
      tables,
      mainTableAlias,
      allInputs,
      cache
    )
  }

  // Process the WHERE clause if it exists
  if (optimizedQuery.where && optimizedQuery.where.length > 0) {
    // Compile all WHERE expressions
    const compiledWheres = optimizedQuery.where.map((where) => compileExpression(where))

    // Apply each WHERE condition as a filter (they are ANDed together)
    for (const compiledWhere of compiledWheres) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return compiledWhere(namespacedRow)
        })
      )
    }
  }

  // Process functional WHERE clauses if they exist
  if (optimizedQuery.fnWhere && optimizedQuery.fnWhere.length > 0) {
    for (const fnWhere of optimizedQuery.fnWhere) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return fnWhere(namespacedRow)
        })
      )
    }
  }

  // Process the SELECT clause early - always create __select_results
  // This eliminates duplication and allows for future DISTINCT implementation
  if (optimizedQuery.fnSelect) {
    // Handle functional select - apply the function to transform the row
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = optimizedQuery.fnSelect!(namespacedRow)
        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults,
          },
        ] as [string, typeof namespacedRow & { __select_results: any }]
      })
    )
  } else if (optimizedQuery.select) {
    pipeline = processSelectToResults(pipeline, optimizedQuery.select, allInputs)
  } else {
    // If no SELECT clause, create __select_results with the main table data
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults =
          !optimizedQuery.join && !optimizedQuery.groupBy
            ? namespacedRow[mainTableAlias]
            : namespacedRow

        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults,
          },
        ] as [string, typeof namespacedRow & { __select_results: any }]
      })
    )
  }

  // Process the GROUP BY clause if it exists
  if (optimizedQuery.groupBy && optimizedQuery.groupBy.length > 0) {
    pipeline = processGroupBy(
      pipeline,
      optimizedQuery.groupBy,
      optimizedQuery.having,
      optimizedQuery.select,
      optimizedQuery.fnHaving
    )
  } else if (optimizedQuery.select) {
    // Check if SELECT contains aggregates but no GROUP BY (implicit single-group aggregation)
    const hasAggregates = Object.values(optimizedQuery.select).some(
      (expr) => expr.type === `agg`
    )
    if (hasAggregates) {
      // Handle implicit single-group aggregation
      pipeline = processGroupBy(
        pipeline,
        [], // Empty group by means single group
        optimizedQuery.having,
        optimizedQuery.select,
        optimizedQuery.fnHaving
      )
    }
  }

  // Process the HAVING clause if it exists (only applies after GROUP BY)
  if (optimizedQuery.having && (!optimizedQuery.groupBy || optimizedQuery.groupBy.length === 0)) {
    // Check if we have aggregates in SELECT that would trigger implicit grouping
    const hasAggregates = optimizedQuery.select
      ? Object.values(optimizedQuery.select).some((expr) => expr.type === `agg`)
      : false

    if (!hasAggregates) {
      throw new Error(`HAVING clause requires GROUP BY clause`)
    }
  }

  // Process functional HAVING clauses outside of GROUP BY (treat as additional WHERE filters)
  if (
    optimizedQuery.fnHaving &&
    optimizedQuery.fnHaving.length > 0 &&
    (!optimizedQuery.groupBy || optimizedQuery.groupBy.length === 0)
  ) {
    // If there's no GROUP BY but there are fnHaving clauses, apply them as filters
    for (const fnHaving of optimizedQuery.fnHaving) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return fnHaving(namespacedRow)
        })
      )
    }
  }

  // Process orderBy parameter if it exists
  if (optimizedQuery.orderBy && optimizedQuery.orderBy.length > 0) {
    const orderedPipeline = processOrderBy(
      pipeline,
      optimizedQuery.orderBy,
      optimizedQuery.limit,
      optimizedQuery.offset
    )

    // Final step: extract the __select_results and include orderBy index
    const resultPipeline = orderedPipeline.pipe(
      map(([key, [row, orderByIndex]]) => {
        // Extract the final results from __select_results and include orderBy index
        const finalResults = (row as any).__select_results
        return [key, [finalResults, orderByIndex]] as [unknown, [any, string]]
      })
    )

    const result = resultPipeline
    // Cache the result before returning
    cache.set(query, result)
    return result
  } else if (optimizedQuery.limit !== undefined || optimizedQuery.offset !== undefined) {
    // If there's a limit or offset without orderBy, throw an error
    throw new Error(
      `LIMIT and OFFSET require an ORDER BY clause to ensure deterministic results`
    )
  }

  // Final step: extract the __select_results and return tuple format (no orderBy)
  const resultPipeline: ResultStream = pipeline.pipe(
    map(([key, row]) => {
      // Extract the final results from __select_results and return [key, [results, undefined]]
      const finalResults = (row as any).__select_results
      return [key, [finalResults, undefined]] as [
        unknown,
        [any, string | undefined],
      ]
    })
  )

  const result = resultPipeline
  // Cache the result before returning
  cache.set(query, result)
  return result
}

/**
 * Processes the FROM clause to extract the main table alias and input stream
 */
function processFrom(
  from: CollectionRef | QueryRef,
  allInputs: Record<string, KeyedStream>,
  cache: QueryCache
): { alias: string; input: KeyedStream } {
  switch (from.type) {
    case `collectionRef`: {
      const input = allInputs[from.collection.id]
      if (!input) {
        throw new Error(
          `Input for collection "${from.collection.id}" not found in inputs map`
        )
      }
      return { alias: from.alias, input }
    }
    case `queryRef`: {
      // Recursively compile the sub-query with cache
      const subQueryInput = compileQuery(from.query, allInputs, cache)

      // Subqueries may return [key, [value, orderByIndex]] (with ORDER BY) or [key, value] (without ORDER BY)
      // We need to extract just the value for use in parent queries
      const extractedInput = subQueryInput.pipe(
        map((data: any) => {
          const [key, [value, _orderByIndex]] = data
          return [key, value] as [unknown, any]
        })
      )

      return { alias: from.alias, input: extractedInput }
    }
    default:
      throw new Error(`Unsupported FROM type: ${(from as any).type}`)
  }
}
