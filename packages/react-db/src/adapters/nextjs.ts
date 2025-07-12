import type { InitialQueryBuilder, QueryBuilder } from '@tanstack/db'
import type { Context, GetResult } from '@tanstack/db'

/**
 * Next.js SSR adapter for useLiveQuery
 * Provides utilities for both App Router and Pages Router
 */
export class NextjsSSRAdapter {
  /**
   * Execute a query in a Next.js Server Component (App Router)
   * @param queryFn - The query function to execute
   * @returns Promise resolving to the query results
   */
  async executeInServerComponent<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>> {
    // For now, return empty array as placeholder
    // In a real implementation, this would execute the query on the server
    console.log('[NextjsSSRAdapter] Executing query in Server Component')
    return []
  }

  /**
   * Execute a query in getServerSideProps (Pages Router)
   * @param queryFn - The query function to execute
   * @returns Promise resolving to the query results
   */
  async executeInGetServerSideProps<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>> {
    // For now, return empty array as placeholder
    // In a real implementation, this would execute the query on the server
    console.log('[NextjsSSRAdapter] Executing query in getServerSideProps')
    return []
  }

  /**
   * Execute a query in getStaticProps (Pages Router)
   * @param queryFn - The query function to execute
   * @returns Promise resolving to the query results
   */
  async executeInGetStaticProps<TContext extends Context>(
    queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
  ): Promise<Array<GetResult<TContext>>> {
    // For now, return empty array as placeholder
    // In a real implementation, this would execute the query on the server
    console.log('[NextjsSSRAdapter] Executing query in getStaticProps')
    return []
  }

  /**
   * Detect if we're in a Next.js environment
   */
  isNextjsEnvironment(): boolean {
    // Check for Next.js specific environment variables
    if (typeof process !== 'undefined' && process?.env?.NEXT_RUNTIME) {
      return true
    }
    
    // Check for Next.js client-side indicators
    if (typeof window !== 'undefined' && (window as any).__NEXT_DATA__) {
      return true
    }
    
    return false
  }

  /**
   * Check if we're in the Edge Runtime
   */
  isEdgeRuntime(): boolean {
    return typeof process !== 'undefined' && process?.env?.NEXT_RUNTIME === 'edge'
  }

  /**
   * Check if we're in a Server Component
   */
  isServerComponent(): boolean {
    return typeof window === 'undefined' && this.isNextjsEnvironment()
  }

  /**
   * Serialize data for Next.js SSR
   * Next.js handles most serialization automatically
   */
  serializeData(data: any): any {
    // Next.js automatically handles JSON serialization
    // We just need to ensure the data is serializable
    return JSON.parse(JSON.stringify(data))
  }

  /**
   * Create Next.js specific props for SSR
   */
  createSSRProps<TResult>(data: Array<TResult>): {
    initialData: Array<TResult>
    enableSSR: boolean
  } {
    return {
      initialData: this.serializeData(data),
      enableSSR: true
    }
  }
}

/**
 * Create a Next.js SSR adapter instance
 */
export function createNextjsAdapter(): NextjsSSRAdapter {
  return new NextjsSSRAdapter()
}

/**
 * Helper function for App Router Server Components
 */
export async function executeQueryInServerComponent<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  const adapter = createNextjsAdapter()
  return adapter.executeInServerComponent(queryFn)
}

/**
 * Helper function for Pages Router getServerSideProps
 */
export async function executeQueryInGetServerSideProps<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  const adapter = createNextjsAdapter()
  return adapter.executeInGetServerSideProps(queryFn)
}

/**
 * Helper function for Pages Router getStaticProps
 */
export async function executeQueryInGetStaticProps<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>
): Promise<Array<GetResult<TContext>>> {
  const adapter = createNextjsAdapter()
  return adapter.executeInGetStaticProps(queryFn)
}