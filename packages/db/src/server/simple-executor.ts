import type { InitialQueryBuilder, QueryBuilder } from '../query/builder/index.js'
import type { Context, GetResult } from '../query/builder/types.js'

/**
 * Simple server-side query executor (placeholder implementation)
 * This is a minimal implementation that returns empty arrays
 * In a real implementation, this would execute queries against actual data sources
 */
export async function executeQueryOnServer<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  // For now, return empty array as placeholder
  // In a real implementation, this would:
  // 1. Build the query using the same query builder
  // 2. Execute against a data source (database, API, etc.)
  // 3. Return the results
  
  console.log('[SSR] executeQueryOnServer called (placeholder implementation)')
  return []
}

/**
 * Check if we're in a server environment
 */
export function isServerEnvironment(): boolean {
  return typeof window === 'undefined'
}

/**
 * Detect the current framework
 */
export function detectFramework(): 'nextjs' | 'tanstack-start' | 'vite' | 'unknown' {
  if (typeof window === 'undefined') {
    // Server-side detection
    if (typeof process !== 'undefined' && process?.env?.NEXT_RUNTIME) {
      return 'nextjs'
    }
    
    if (typeof process !== 'undefined' && process?.env?.TANSTACK_START) {
      return 'tanstack-start'
    }
    
    if (typeof process !== 'undefined' && process?.env?.VITE_SSR) {
      return 'vite'
    }
  }
  
  return 'unknown'
}

/**
 * Check if SSR is supported in the current environment
 */
export function supportsSSR(): boolean {
  return isServerEnvironment() && detectFramework() !== 'unknown'
}