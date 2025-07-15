import type { QueryIR } from "./ir.js"

/**
 * Optimizes a query by analyzing nested queries (includes) and converting them to joins
 * where possible. This flattens the query structure for better performance.
 */
export function optimizeQuery(query: QueryIR): QueryIR {
  // For now, don't optimize includes to joins to preserve the nested structure
  // This will be implemented later when we have proper support for materialized nested collections
  return query
}

/**
 * Analyzes a nested query to determine the foreign key relationship
 * between the parent and child queries.
 */
function analyzeNestedQueryRelationship(
  parentQuery: QueryIR,
  nestedQuery: QueryIR,
  includeAlias: string
): { foreignKey: any; localKey: any } | null {
  // Get the parent table alias
  const parentAlias = parentQuery.from.type === 'collectionRef' 
    ? parentQuery.from.alias 
    : parentQuery.from.alias
  
  // Get the nested query table alias
  const childAlias = nestedQuery.from.type === 'collectionRef'
    ? nestedQuery.from.alias
    : nestedQuery.from.alias

  // Look for where clauses in the nested query that reference the parent
  if (!nestedQuery.where || nestedQuery.where.length === 0) {
    return null
  }

  for (const whereClause of nestedQuery.where) {
    const relationship = extractRelationshipFromWhereClause(
      whereClause,
      parentAlias,
      childAlias
    )
    
    if (relationship) {
      return relationship
    }
  }

  return null
}

/**
 * Extracts a foreign key relationship from a where clause
 */
function extractRelationshipFromWhereClause(
  whereClause: any,
  parentAlias: string,
  childAlias: string
): { foreignKey: any; localKey: any } | null {
  // Look for equality comparisons between parent and child
  if (whereClause.type === `func` && whereClause.name === `eq`) {
    const [left, right] = whereClause.args

    // Check if one side references the parent and the other references the child
    const leftParentRef = isReferenceToAlias(left, parentAlias)
    const leftChildRef = isReferenceToAlias(left, childAlias)
    const rightParentRef = isReferenceToAlias(right, parentAlias)
    const rightChildRef = isReferenceToAlias(right, childAlias)

    if (leftParentRef && rightChildRef) {
      return {
        foreignKey: right, // Child's foreign key
        localKey: left,    // Parent's primary key
      }
    } else if (leftChildRef && rightParentRef) {
      return {
        foreignKey: left,  // Child's foreign key
        localKey: right,   // Parent's primary key
      }
    }
  }

  return null
}

/**
 * Checks if an expression is a reference to a specific table alias
 */
function isReferenceToAlias(expression: any, alias: string): boolean {
  return (
    expression.type === `ref` &&
    expression.path.length > 0 &&
    expression.path[0] === alias
  )
}