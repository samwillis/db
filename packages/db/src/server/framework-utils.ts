import type { FrameworkType } from './types.js'

// Type declarations for globals
declare global {
  interface Window {
    __NEXT_DATA__?: any
    __TANSTACK_START__?: any
    __SVELTE_KIT__?: any
    __ASTRO__?: any
  }
  
  var process: {
    env: Record<string, string | undefined>
    versions?: { node?: string }
  } | undefined
  
  var global: any
}

/**
 * Detect the current framework environment
 */
export function detectFramework(): FrameworkType {
  // Server-side detection
  if (typeof window === 'undefined') {
    // Check for Next.js
    if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME) {
      return 'nextjs'
    }
    
    // Check for TanStack Start
    if (typeof process !== 'undefined' && process.env.TANSTACK_START) {
      return 'tanstack-start'
    }
    
    // Check for Vite SSR
    if (typeof process !== 'undefined' && process.env.VITE_SSR) {
      return 'vite'
    }
    
    // Check for SvelteKit
    if (typeof process !== 'undefined' && process.env.SVELTE_KIT) {
      return 'sveltekit'
    }
    
    // Check for Astro
    if (typeof process !== 'undefined' && process.env.ASTRO) {
      return 'astro'
    }
    
    // Check for SolidStart
    if (typeof process !== 'undefined' && process.env.SOLID_START) {
      return 'solidstart'
    }
    
    // Check for common framework indicators
    if (typeof global !== 'undefined' && typeof process !== 'undefined' && process.env.NODE_ENV) {
      // We're in Node.js but couldn't detect specific framework
      return 'unknown'
    }
  }
  
  // Client-side detection
  if (typeof window !== 'undefined') {
    // Check for Next.js client-side
    if (window.__NEXT_DATA__) {
      return 'nextjs'
    }
    
    // Check for TanStack Start client-side
    if (window.__TANSTACK_START__) {
      return 'tanstack-start'
    }
    
    // Check for SvelteKit client-side
    if (window.__SVELTE_KIT__) {
      return 'sveltekit'
    }
    
    // Check for Astro client-side
    if (window.__ASTRO__) {
      return 'astro'
    }
  }
  
  return 'unknown'
}

/**
 * Check if we're running in a server environment
 */
export function isServerEnvironment(): boolean {
  return typeof window === 'undefined'
}

/**
 * Check if we're running in a client environment
 */
export function isClientEnvironment(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Check if the current environment supports SSR
 */
export function supportsSSR(): boolean {
  if (!isServerEnvironment()) {
    return false
  }
  
  const framework = detectFramework()
  return framework !== 'unknown'
}

/**
 * Get runtime-specific information
 */
export function getRuntimeInfo(): {
  framework: FrameworkType
  isServer: boolean
  isClient: boolean
  isEdge: boolean
  isNodejs: boolean
  supportedFeatures: string[]
} {
  const framework = detectFramework()
  const isServer = isServerEnvironment()
  const isClient = isClientEnvironment()
  const isEdge = typeof process !== 'undefined' && !!(process.env.NEXT_RUNTIME === 'edge' || process.env.EDGE_RUNTIME)
  const isNodejs = !isEdge && typeof process !== 'undefined' && !!process.versions?.node
  
  const supportedFeatures: string[] = []
  
  if (isServer) {
    supportedFeatures.push('ssr')
  }
  
  if (isClient) {
    supportedFeatures.push('client-hydration')
  }
  
  if (framework === 'nextjs') {
    supportedFeatures.push('server-components', 'app-router', 'pages-router')
  }
  
  if (framework === 'tanstack-start') {
    supportedFeatures.push('file-routing', 'type-safety', 'universal-runtime')
  }
  
  if (isNodejs) {
    supportedFeatures.push('nodejs-apis')
  }
  
  if (isEdge) {
    supportedFeatures.push('edge-runtime')
  }
  
  return {
    framework,
    isServer,
    isClient,
    isEdge,
    isNodejs,
    supportedFeatures
  }
}

/**
 * Validate that the current environment supports the requested features
 */
export function validateEnvironment(requiredFeatures: string[]): void {
  const runtimeInfo = getRuntimeInfo()
  const missingFeatures = requiredFeatures.filter(
    feature => !runtimeInfo.supportedFeatures.includes(feature)
  )
  
  if (missingFeatures.length > 0) {
    throw new Error(
      `Environment validation failed. Missing required features: ${missingFeatures.join(', ')}`
    )
  }
}

/**
 * Get framework-specific error messages
 */
export function getFrameworkErrorMessage(framework: FrameworkType, error: string): string {
  const baseMessage = `[${framework}] ${error}`
  
  switch (framework) {
    case 'nextjs':
      return `${baseMessage}\nMake sure you're running in a Next.js environment. For App Router, use Server Components for SSR. For Pages Router, use getServerSideProps.`
    
    case 'tanstack-start':
      return `${baseMessage}\nMake sure you're using TanStack Start route loaders for server-side data fetching.`
    
    case 'vite':
      return `${baseMessage}\nMake sure you have Vite SSR configured properly.`
    
    case 'sveltekit':
      return `${baseMessage}\nMake sure you're using SvelteKit load functions for server-side data fetching.`
    
    case 'astro':
      return `${baseMessage}\nMake sure you're using Astro component scripts for server-side data fetching.`
    
    case 'solidstart':
      return `${baseMessage}\nMake sure you're using SolidStart createServerData$ for server-side data fetching.`
    
    default:
      return `${baseMessage}\nFramework not detected. SSR functionality may not work properly.`
  }
}

/**
 * Create development-time warnings for framework misuse
 */
export function createFrameworkWarnings(framework: FrameworkType): {
  warnSSRUsage: (message: string) => void
  warnHydrationMismatch: (serverData: any, clientData: any) => void
} {
  const isDevelopment = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
  
  return {
    warnSSRUsage: (message: string) => {
      if (isDevelopment) {
        console.warn(getFrameworkErrorMessage(framework, message))
      }
    },
    
    warnHydrationMismatch: (serverData: any, clientData: any) => {
      if (isDevelopment) {
        const serverHash = JSON.stringify(serverData)
        const clientHash = JSON.stringify(clientData)
        
        if (serverHash !== clientHash) {
          console.warn(
            getFrameworkErrorMessage(
              framework,
              `Hydration mismatch detected! Server: ${serverData.length} items, Client: ${clientData.length} items`
            )
          )
        }
      }
    }
  }
}