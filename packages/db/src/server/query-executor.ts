import type { InitialQueryBuilder, QueryBuilder } from '../query/builder/index.js'
import type { Context, GetResult } from '../query/builder/types.js'
import type { Collection } from '../collection.js'
import { UniversalSSRExecutor } from './ssr-executor.js'

// Global SSR executor instance
let globalSSRExecutor: UniversalSSRExecutor | null = null

/**
 * Configure the global SSR executor
 */
export function configureSSRExecutor(options: {
  collections?: Map<string, Collection<any, any, any>>
  debug?: boolean
}): void {
  globalSSRExecutor = new UniversalSSRExecutor(options)
}

/**
 * Get the global SSR executor (create if not exists)
 */
export function getSSRExecutor(): UniversalSSRExecutor {
  if (!globalSSRExecutor) {
    globalSSRExecutor = new UniversalSSRExecutor()
  }
  return globalSSRExecutor
}

/**
 * Execute a query on the server
 * This is the main API for server-side query execution
 */
export async function executeQueryOnServer<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  const executor = getSSRExecutor()
  return executor.executeQuery(queryFn)
}

/**
 * Execute a query with a specific SSR executor
 */
export async function executeQueryWithExecutor<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  executor: UniversalSSRExecutor
): Promise<Array<GetResult<TContext>>> {
  return executor.executeQuery(queryFn)
}

/**
 * Create a server-side query executor with collections
 */
export function createSSRExecutor(
  collections: Map<string, Collection<any, any, any>>,
  options: {
    debug?: boolean
  } = {}
): UniversalSSRExecutor {
  return new UniversalSSRExecutor({
    collections,
    debug: options.debug || false
  })
}

/**
 * Add a collection to the global SSR executor
 */
export function addCollectionToSSR(id: string, collection: Collection<any, any, any>): void {
  const executor = getSSRExecutor()
  executor.addCollection(id, collection)
}

/**
 * Remove a collection from the global SSR executor
 */
export function removeCollectionFromSSR(id: string): void {
  const executor = getSSRExecutor()
  executor.removeCollection(id)
}