// Next.js adapter
export { NextjsSSRAdapter, createNextjsAdapter } from './nextjs.js'
export { executeQueryInServerComponent, executeQueryInGetServerSideProps } from './nextjs.js'

// TanStack Start adapter
export { TanStackStartSSRAdapter, createTanStackStartAdapter } from './tanstack-start.js'
export { createTypedLoader, createServerFunction, executeQueryInRouteLoader } from './tanstack-start.js'

// Re-export commonly used types
export type { InitialQueryBuilder, QueryBuilder, Context, GetResult } from '@tanstack/db'