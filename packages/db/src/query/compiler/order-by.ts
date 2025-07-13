import { orderByWithFractionalIndex } from "@electric-sql/d2mini"
import { ascComparator } from "../../utils/comparison.js"
import { compileExpression } from "./evaluators.js"
import type { OrderByClause } from "../ir.js"
import type { NamespacedAndKeyedStream, NamespacedRow } from "../../types.js"
import type { IStreamBuilder, KeyValue } from "@electric-sql/d2mini"

/**
 * Processes the ORDER BY clause
 * Works with the new structure that has both namespaced row data and __select_results
 * Always uses fractional indexing and adds the index as __ordering_index to the result
 */
export function processOrderBy(
  pipeline: NamespacedAndKeyedStream,
  orderByClause: Array<OrderByClause>,
  limit?: number,
  offset?: number
): IStreamBuilder<KeyValue<unknown, [NamespacedRow, string]>> {
  // Pre-compile all order by expressions
  const compiledOrderBy = orderByClause.map((clause) => ({
    compiledExpression: compileExpression(clause.expression),
    direction: clause.direction,
  }))

  // Create a value extractor function for the orderBy operator
  const valueExtractor = (row: NamespacedRow & { __select_results?: any }) => {
    // For ORDER BY expressions, we need to provide access to both:
    // 1. The original namespaced row data (for direct table column references)
    // 2. The __select_results (for SELECT alias references)

    // Create a merged context for expression evaluation
    const orderByContext = { ...row }

    // If there are select results, merge them at the top level for alias access
    if (row.__select_results) {
      // Add select results as top-level properties for alias access
      Object.assign(orderByContext, row.__select_results)
    }

    if (orderByClause.length > 1) {
      // For multiple orderBy columns, create a composite key
      return compiledOrderBy.map((compiled) =>
        compiled.compiledExpression(orderByContext)
      )
    } else if (orderByClause.length === 1) {
      // For a single orderBy column, use the value directly
      const compiled = compiledOrderBy[0]!
      return compiled.compiledExpression(orderByContext)
    }

    // Default case - no ordering
    return null
  }

  // Create comparator functions
  const descComparator = (a: unknown, b: unknown): number => {
    return ascComparator(b, a)
  }

  // Create a multi-property comparator that respects the order and direction of each property
  const makeComparator = () => {
    return (a: unknown, b: unknown) => {
      // If we're comparing arrays (multiple properties), compare each property in order
      if (orderByClause.length > 1) {
        const arrayA = a as Array<unknown>
        const arrayB = b as Array<unknown>
        for (let i = 0; i < orderByClause.length; i++) {
          const direction = orderByClause[i]!.direction
          const compareFn =
            direction === `desc` ? descComparator : ascComparator
          const result = compareFn(arrayA[i], arrayB[i])
          if (result !== 0) {
            return result
          }
        }
        return arrayA.length - arrayB.length
      }

      // Single property comparison
      if (orderByClause.length === 1) {
        const direction = orderByClause[0]!.direction
        return direction === `desc` ? descComparator(a, b) : ascComparator(a, b)
      }

      return ascComparator(a, b)
    }
  }

  const comparator = makeComparator()

  // Use fractional indexing and return the tuple [value, index]
  return pipeline.pipe(
    orderByWithFractionalIndex(valueExtractor, {
      limit,
      offset,
      comparator,
    })
    // orderByWithFractionalIndex returns [key, [value, index]] - we keep this format
  )
}
