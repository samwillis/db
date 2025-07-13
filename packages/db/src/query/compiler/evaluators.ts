import type { BasicExpression, Func, PropRef } from "../ir.js"
import type { NamespacedRow } from "../../types.js"

/**
 * Compiled expression evaluator function type
 */
export type CompiledExpression = (namespacedRow: NamespacedRow) => any

/**
 * Compiled single-row expression evaluator function type
 */
export type CompiledSingleRowExpression = (item: Record<string, unknown>) => any

/**
 * Compiles an expression into an optimized evaluator function.
 * This eliminates branching during evaluation by pre-compiling the expression structure.
 */
export function compileExpression(expr: BasicExpression): CompiledExpression {
  const compiledFn = compileExpressionInternal(expr, false)
  return compiledFn as CompiledExpression
}

/**
 * Compiles a single-row expression into an optimized evaluator function.
 */
export function compileSingleRowExpression(
  expr: BasicExpression
): CompiledSingleRowExpression {
  const compiledFn = compileExpressionInternal(expr, true)
  return compiledFn as CompiledSingleRowExpression
}

/**
 * Internal unified expression compiler that handles both namespaced and single-row evaluation
 */
function compileExpressionInternal(
  expr: BasicExpression,
  isSingleRow: boolean
): (data: any) => any {
  switch (expr.type) {
    case `val`: {
      // For constant values, return a function that just returns the value
      const value = expr.value
      return () => value
    }

    case `ref`: {
      // For references, compile based on evaluation mode
      return isSingleRow ? compileSingleRowRef(expr) : compileRef(expr)
    }

    case `func`: {
      // For functions, use the unified compiler
      return compileFunction(expr, isSingleRow)
    }

    default:
      throw new Error(`Unknown expression type: ${(expr as any).type}`)
  }
}

/**
 * Compiles a reference expression into an optimized evaluator
 */
function compileRef(ref: PropRef): CompiledExpression {
  const [tableAlias, ...propertyPath] = ref.path

  if (!tableAlias) {
    throw new Error(`Reference path cannot be empty`)
  }

  // Pre-compile the property path navigation
  if (propertyPath.length === 0) {
    // Simple table reference
    return (namespacedRow) => namespacedRow[tableAlias]
  } else if (propertyPath.length === 1) {
    // Single property access - most common case
    const prop = propertyPath[0]!
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias]
      return tableData?.[prop]
    }
  } else {
    // Multiple property navigation
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias]
      if (tableData === undefined) {
        return undefined
      }

      let value: any = tableData
      for (const prop of propertyPath) {
        if (value == null) {
          return value
        }
        value = value[prop]
      }
      return value
    }
  }
}

/**
 * Compiles a reference expression for single-row evaluation
 */
function compileSingleRowRef(ref: PropRef): CompiledSingleRowExpression {
  const propertyPath = ref.path

  if (propertyPath.length === 0) {
    // Empty path - return the whole item
    return (item) => item
  } else if (propertyPath.length === 1) {
    // Single property access - most common case
    const prop = propertyPath[0]!
    return (item) => item[prop]
  } else {
    // Multiple property navigation
    return (item) => {
      let value: any = item
      for (const prop of propertyPath) {
        if (value == null) {
          return value
        }
        value = value[prop]
      }
      return value
    }
  }
}

/**
 * Compiles a function expression for both namespaced and single-row evaluation
 */
function compileFunction(func: Func, isSingleRow: boolean): (data: any) => any {
  // Pre-compile all arguments using the appropriate compiler
  const compiledArgs = func.args.map((arg) =>
    compileExpressionInternal(arg, isSingleRow)
  )

  switch (func.name) {
    // Comparison operators
    case `eq`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return a === b
      }
    }
    case `gt`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return a > b
      }
    }
    case `gte`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return a >= b
      }
    }
    case `lt`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return a < b
      }
    }
    case `lte`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return a <= b
      }
    }

    // Boolean operators
    case `and`:
      return (data) => {
        for (const compiledArg of compiledArgs) {
          if (!compiledArg(data)) {
            return false
          }
        }
        return true
      }
    case `or`:
      return (data) => {
        for (const compiledArg of compiledArgs) {
          if (compiledArg(data)) {
            return true
          }
        }
        return false
      }
    case `not`: {
      const arg = compiledArgs[0]!
      return (data) => !arg(data)
    }

    // Array operators
    case `in`: {
      const valueEvaluator = compiledArgs[0]!
      const arrayEvaluator = compiledArgs[1]!
      return (data) => {
        const value = valueEvaluator(data)
        const array = arrayEvaluator(data)
        if (!Array.isArray(array)) {
          return false
        }
        return array.includes(value)
      }
    }

    // String operators
    case `like`: {
      const valueEvaluator = compiledArgs[0]!
      const patternEvaluator = compiledArgs[1]!
      return (data) => {
        const value = valueEvaluator(data)
        const pattern = patternEvaluator(data)
        return evaluateLike(value, pattern, false)
      }
    }
    case `ilike`: {
      const valueEvaluator = compiledArgs[0]!
      const patternEvaluator = compiledArgs[1]!
      return (data) => {
        const value = valueEvaluator(data)
        const pattern = patternEvaluator(data)
        return evaluateLike(value, pattern, true)
      }
    }

    // String functions
    case `upper`: {
      const arg = compiledArgs[0]!
      return (data) => {
        const value = arg(data)
        return typeof value === `string` ? value.toUpperCase() : value
      }
    }
    case `lower`: {
      const arg = compiledArgs[0]!
      return (data) => {
        const value = arg(data)
        return typeof value === `string` ? value.toLowerCase() : value
      }
    }
    case `length`: {
      const arg = compiledArgs[0]!
      return (data) => {
        const value = arg(data)
        if (typeof value === `string`) {
          return value.length
        }
        if (Array.isArray(value)) {
          return value.length
        }
        return 0
      }
    }
    case `concat`:
      return (data) => {
        return compiledArgs
          .map((evaluator) => {
            const arg = evaluator(data)
            try {
              return String(arg ?? ``)
            } catch {
              try {
                return JSON.stringify(arg) || ``
              } catch {
                return `[object]`
              }
            }
          })
          .join(``)
      }
    case `coalesce`:
      return (data) => {
        for (const evaluator of compiledArgs) {
          const value = evaluator(data)
          if (value !== null && value !== undefined) {
            return value
          }
        }
        return null
      }

    // Math functions
    case `add`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return (a ?? 0) + (b ?? 0)
      }
    }
    case `subtract`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return (a ?? 0) - (b ?? 0)
      }
    }
    case `multiply`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        return (a ?? 0) * (b ?? 0)
      }
    }
    case `divide`: {
      const argA = compiledArgs[0]!
      const argB = compiledArgs[1]!
      return (data) => {
        const a = argA(data)
        const b = argB(data)
        const divisor = b ?? 0
        return divisor !== 0 ? (a ?? 0) / divisor : null
      }
    }

    default:
      throw new Error(`Unknown function: ${func.name}`)
  }
}

/**
 * Evaluates LIKE/ILIKE patterns
 */
function evaluateLike(
  value: any,
  pattern: any,
  caseInsensitive: boolean
): boolean {
  if (typeof value !== `string` || typeof pattern !== `string`) {
    return false
  }

  const searchValue = caseInsensitive ? value.toLowerCase() : value
  const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern

  // Convert SQL LIKE pattern to regex
  // First escape all regex special chars except % and _
  let regexPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)

  // Then convert SQL wildcards to regex
  regexPattern = regexPattern.replace(/%/g, `.*`) // % matches any sequence
  regexPattern = regexPattern.replace(/_/g, `.`) // _ matches any single char

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(searchValue)
}
