import type { InitialQueryBuilder, QueryBuilder } from '../query/builder/index.js'
import type { Context, GetResult } from '../query/builder/types.js'
import type { Collection } from '../collection.js'

/**
 * Interface for server-side query execution
 */
export interface SSRExecutor {
  /**
   * Execute a query on the server and return the results
   */
  executeQuery<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>>
}

/**
 * Configuration options for SSR executor
 */
export interface SSRExecutorOptions {
  /**
   * Map of collection IDs to their collections
   */
  collections?: Map<string, Collection<any, any, any>>
  
  /**
   * Custom data source for server-side execution
   */
  dataSource?: SSRDataSource
  
  /**
   * Whether to enable debug logging
   */
  debug?: boolean
}

/**
 * Interface for custom data sources
 */
export interface SSRDataSource {
  /**
   * Execute a compiled query against the data source
   */
  executeQuery(query: any): Promise<Array<any>>
}

/**
 * Framework detection result
 */
export type FrameworkType = 'nextjs' | 'tanstack-start' | 'vite' | 'sveltekit' | 'astro' | 'solidstart' | 'unknown'

/**
 * SSR configuration options for useLiveQuery
 */
export interface SSROptions<TResult = any> {
  /**
   * Initial data to use for server-side rendering
   */
  initialData?: Array<TResult>
  
  /**
   * Whether to enable SSR
   */
  enableSSR?: boolean
  
  /**
   * Target framework (auto-detected if not specified)
   */
  framework?: FrameworkType
  
  /**
   * Whether to defer sync until after hydration
   */
  deferSync?: boolean
}