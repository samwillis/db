import type { InitialQueryBuilder, QueryBuilder } from '@tanstack/db'
import type { Context, GetResult } from '@tanstack/db'

/**
 * TanStack Start SSR adapter for useLiveQuery
 * Provides utilities for file-based routing and type-safe loaders
 */
export class TanStackStartSSRAdapter {
  /**
   * Execute a query in a TanStack Start route loader
   * @param queryFn - The query function to execute
   * @returns Promise resolving to the query results
   */
  async executeInRouteLoader<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>> {
    // For now, return empty array as placeholder
    // In a real implementation, this would execute the query on the server
    console.log('[TanStackStartSSRAdapter] Executing query in route loader')
    return []
  }

  /**
   * Create a typed loader function for TanStack Start
   * @param queryFn - The query function to execute
   * @returns A loader function that can be used in route definitions
   */
  createLoader<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): () => Promise<Array<GetResult<TContext>>> {
    return async () => {
      return this.executeInRouteLoader(queryFn)
    }
  }

  /**
   * Create a typed server function for TanStack Start
   * @param queryFn - The query function to execute
   * @returns A server function that can be called from client components
   */
  createServerFunction<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): () => Promise<Array<GetResult<TContext>>> {
    return async () => {
      // For now, return empty array as placeholder
      // In a real implementation, this would use createServerFn
      console.log('[TanStackStartSSRAdapter] Executing query in server function')
      return []
    }
  }

  /**
   * Detect if we're in a TanStack Start environment
   */
  isTanStackStartEnvironment(): boolean {
    // Check for TanStack Start specific environment variables
    if (typeof process !== 'undefined' && process?.env?.TANSTACK_START) {
      return true
    }
    
    // Check for TanStack Start client-side indicators
    if (typeof window !== 'undefined' && (window as any).__TANSTACK_START__) {
      return true
    }
    
    return false
  }

  /**
   * Check if we're in a server environment
   */
  isServerEnvironment(): boolean {
    return typeof window === 'undefined' && this.isTanStackStartEnvironment()
  }

  /**
   * Serialize data for TanStack Start SSR
   * TanStack Start supports complex data types natively
   */
  serializeData(data: any): { __tanstack_data: string } {
    return {
      __tanstack_data: JSON.stringify(data, (key, value) => {
        if (value instanceof Date) {
          return { __type: 'Date', value: value.toISOString() }
        }
        if (typeof value === 'bigint') {
          return { __type: 'BigInt', value: value.toString() }
        }
        return value
      })
    }
  }

  /**
   * Deserialize data from TanStack Start SSR
   */
  deserializeData(serialized: { __tanstack_data: string }): any {
    return JSON.parse(serialized.__tanstack_data, (key, value) => {
      if (value && typeof value === 'object' && value.__type) {
        switch (value.__type) {
          case 'Date':
            return new Date(value.value)
          case 'BigInt':
            return BigInt(value.value)
          default:
            return value
        }
      }
      return value
    })
  }

  /**
   * Create TanStack Start specific props for SSR
   */
  createSSRProps<TResult>(data: Array<TResult>): {
    initialData: Array<TResult>
    enableSSR: boolean
    deferSync: boolean
  } {
    return {
      initialData: data,
      enableSSR: true,
      deferSync: true // TanStack Start handles hydration smoothly
    }
  }
}

/**
 * Create a TanStack Start SSR adapter instance
 */
export function createTanStackStartAdapter(): TanStackStartSSRAdapter {
  return new TanStackStartSSRAdapter()
}

/**
 * Helper function to create a typed loader
 */
export function createTypedLoader<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): () => Promise<Array<GetResult<TContext>>> {
  const adapter = createTanStackStartAdapter()
  return adapter.createLoader(queryFn)
}

/**
 * Helper function to create a server function
 */
export function createServerFunction<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): () => Promise<Array<GetResult<TContext>>> {
  const adapter = createTanStackStartAdapter()
  return adapter.createServerFunction(queryFn)
}

/**
 * Helper function to execute query in route loader
 */
export async function executeQueryInRouteLoader<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  const adapter = createTanStackStartAdapter()
  return adapter.executeInRouteLoader(queryFn)
}