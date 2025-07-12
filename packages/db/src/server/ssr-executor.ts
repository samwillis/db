import type { InitialQueryBuilder, QueryBuilder } from '../query/builder/index.js'
import type { Context, GetResult } from '../query/builder/types.js'
import type { Collection } from '../collection.js'
import type { SSRExecutor, SSRExecutorOptions, SSRDataSource } from './types.js'
import { buildQuery } from '../query/builder/index.js'

/**
 * Universal SSR executor for server-side query execution
 */
export class UniversalSSRExecutor implements SSRExecutor {
  private collections: Map<string, Collection<any, any, any>>
  private dataSource?: SSRDataSource
  private debug: boolean

  constructor(options: SSRExecutorOptions = {}) {
    this.collections = options.collections || new Map()
    this.dataSource = options.dataSource
    this.debug = options.debug || false
  }

  /**
   * Execute a query on the server and return the results
   */
  async executeQuery<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>> {
    try {
      // Build the query using the same query builder
      const query = buildQuery<TContext>(queryFn)

      if (this.debug) {
        console.log('[SSR] Executing query:', query)
      }

      // If using a custom data source, delegate to it
      if (this.dataSource) {
        return await this.dataSource.executeQuery(query)
      }

      // For SSR, we'll use a simplified approach
      // In a real implementation, this would need to properly execute the query
      // For now, we'll return an empty array as a placeholder
      return []
    } catch (error) {
      console.error('[SSR] Query execution failed:', error)
      throw error
    }
  }



  /**
   * Add a collection to the executor
   */
  addCollection(id: string, collection: Collection<any, any, any>): void {
    this.collections.set(id, collection)
  }

  /**
   * Remove a collection from the executor
   */
  removeCollection(id: string): void {
    this.collections.delete(id)
  }

  /**
   * Get all registered collections
   */
  getCollections(): Map<string, Collection<any, any, any>> {
    return new Map(this.collections)
  }
}