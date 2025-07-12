import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { 
  detectFramework, 
  isServerEnvironment, 
  isClientEnvironment,
  supportsSSR,
  getRuntimeInfo,
  validateEnvironment,
  getFrameworkErrorMessage,
  createFrameworkWarnings
} from "../../src/server/framework-utils.js"

describe("Framework Detection", () => {
  let originalWindow: typeof globalThis.window
  let originalProcess: typeof globalThis.process

  beforeEach(() => {
    originalWindow = globalThis.window
    originalProcess = globalThis.process
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.process = originalProcess
  })

  describe("detectFramework", () => {
    it("should detect Next.js from NEXT_RUNTIME environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "nodejs" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("nextjs")
    })

    it("should detect TanStack Start from TANSTACK_START environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { TANSTACK_START: "true" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("tanstack-start")
    })

    it("should detect Vite from VITE_SSR environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { VITE_SSR: "true" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("vite")
    })

    it("should detect SvelteKit from SVELTE_KIT environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { SVELTE_KIT: "true" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("sveltekit")
    })

    it("should detect Astro from ASTRO environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { ASTRO: "true" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("astro")
    })

    it("should detect SolidStart from SOLID_START environment variable", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { SOLID_START: "true" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("solidstart")
    })

    it("should return unknown when no framework is detected in server", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NODE_ENV: "development" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("unknown")
    })

    it("should detect Next.js from client-side __NEXT_DATA__", () => {
      globalThis.window = {
        ...originalWindow,
        __NEXT_DATA__: { page: "/" }
      } as any

      expect(detectFramework()).toBe("nextjs")
    })

    it("should detect TanStack Start from client-side __TANSTACK_START__", () => {
      globalThis.window = {
        ...originalWindow,
        __TANSTACK_START__: true
      } as any

      expect(detectFramework()).toBe("tanstack-start")
    })

    it("should detect SvelteKit from client-side __SVELTE_KIT__", () => {
      globalThis.window = {
        ...originalWindow,
        __SVELTE_KIT__: true
      } as any

      expect(detectFramework()).toBe("sveltekit")
    })

    it("should detect Astro from client-side __ASTRO__", () => {
      globalThis.window = {
        ...originalWindow,
        __ASTRO__: true
      } as any

      expect(detectFramework()).toBe("astro")
    })

    it("should return unknown when no framework detected in client", () => {
      // Normal browser environment without framework indicators
      expect(detectFramework()).toBe("unknown")
    })
  })

  describe("Environment Detection", () => {
    it("should detect server environment when window is undefined", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      
      expect(isServerEnvironment()).toBe(true)
      expect(isClientEnvironment()).toBe(false)
    })

    it("should detect client environment when window is defined", () => {
      // Normal browser environment
      expect(isServerEnvironment()).toBe(false)
      expect(isClientEnvironment()).toBe(true)
    })

    it("should support SSR when in server environment with known framework", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "nodejs" },
        versions: { node: "18.0.0" }
      } as any

      expect(supportsSSR()).toBe(true)
    })

    it("should not support SSR when in client environment", () => {
      expect(supportsSSR()).toBe(false)
    })

    it("should not support SSR when framework is unknown", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NODE_ENV: "development" },
        versions: { node: "18.0.0" }
      } as any

      expect(supportsSSR()).toBe(false)
    })
  })

  describe("Runtime Information", () => {
    it("should provide complete runtime info for Next.js in Node.js", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "nodejs" },
        versions: { node: "18.0.0" }
      } as any

      const info = getRuntimeInfo()

      expect(info.framework).toBe("nextjs")
      expect(info.isServer).toBe(true)
      expect(info.isClient).toBe(false)
      expect(info.isEdge).toBe(false)
      expect(info.isNodejs).toBe(true)
      expect(info.supportedFeatures).toContain("ssr")
      expect(info.supportedFeatures).toContain("nodejs-apis")
      expect(info.supportedFeatures).toContain("server-components")
    })

    it("should provide runtime info for Next.js Edge Runtime", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "edge" },
        versions: undefined // Edge runtime doesn't have Node.js versions
      } as any

      const info = getRuntimeInfo()

      expect(info.framework).toBe("nextjs")
      expect(info.isServer).toBe(true)
      expect(info.isClient).toBe(false)
      expect(info.isEdge).toBe(true)
      expect(info.isNodejs).toBe(false)
      expect(info.supportedFeatures).toContain("ssr")
      expect(info.supportedFeatures).toContain("edge-runtime")
      expect(info.supportedFeatures).not.toContain("nodejs-apis")
    })

    it("should provide runtime info for TanStack Start", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { TANSTACK_START: "true" },
        versions: { node: "18.0.0" }
      } as any

      const info = getRuntimeInfo()

      expect(info.framework).toBe("tanstack-start")
      expect(info.supportedFeatures).toContain("file-routing")
      expect(info.supportedFeatures).toContain("type-safety")
      expect(info.supportedFeatures).toContain("universal-runtime")
    })

    it("should provide runtime info for client environment", () => {
      const info = getRuntimeInfo()

      expect(info.isServer).toBe(false)
      expect(info.isClient).toBe(true)
      expect(info.supportedFeatures).toContain("client-hydration")
      expect(info.supportedFeatures).not.toContain("ssr")
    })
  })

  describe("Environment Validation", () => {
    it("should pass validation when required features are available", () => {
      // @ts-ignore - simulate server environment with Next.js
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "nodejs" },
        versions: { node: "18.0.0" }
      } as any

      expect(() => {
        validateEnvironment(["ssr", "nodejs-apis"])
      }).not.toThrow()
    })

    it("should fail validation when required features are missing", () => {
      // Client environment missing SSR
      expect(() => {
        validateEnvironment(["ssr"])
      }).toThrow("Environment validation failed. Missing required features: ssr")
    })

    it("should fail validation with multiple missing features", () => {
      // Client environment missing SSR and Node.js APIs
      expect(() => {
        validateEnvironment(["ssr", "nodejs-apis", "edge-runtime"])
      }).toThrow("Environment validation failed. Missing required features: ssr, nodejs-apis, edge-runtime")
    })
  })

  describe("Error Messages", () => {
    it("should provide Next.js specific error messages", () => {
      const message = getFrameworkErrorMessage("nextjs", "SSR not working")
      
      expect(message).toContain("[nextjs] SSR not working")
      expect(message).toContain("Next.js environment")
      expect(message).toContain("Server Components")
      expect(message).toContain("getServerSideProps")
    })

    it("should provide TanStack Start specific error messages", () => {
      const message = getFrameworkErrorMessage("tanstack-start", "Route loader failed")
      
      expect(message).toContain("[tanstack-start] Route loader failed")
      expect(message).toContain("TanStack Start route loaders")
    })

    it("should provide Vite specific error messages", () => {
      const message = getFrameworkErrorMessage("vite", "SSR failed")
      
      expect(message).toContain("[vite] SSR failed")
      expect(message).toContain("Vite SSR configured")
    })

    it("should provide SvelteKit specific error messages", () => {
      const message = getFrameworkErrorMessage("sveltekit", "Load function error")
      
      expect(message).toContain("[sveltekit] Load function error")
      expect(message).toContain("SvelteKit load functions")
    })

    it("should provide Astro specific error messages", () => {
      const message = getFrameworkErrorMessage("astro", "Component script error")
      
      expect(message).toContain("[astro] Component script error")
      expect(message).toContain("Astro component scripts")
    })

    it("should provide SolidStart specific error messages", () => {
      const message = getFrameworkErrorMessage("solidstart", "Server data error")
      
      expect(message).toContain("[solidstart] Server data error")
      expect(message).toContain("SolidStart createServerData$")
    })

    it("should provide generic error messages for unknown frameworks", () => {
      const message = getFrameworkErrorMessage("unknown", "Some error")
      
      expect(message).toContain("[unknown] Some error")
      expect(message).toContain("Framework not detected")
    })
  })

  describe("Development Warnings", () => {
    beforeEach(() => {
      globalThis.process = {
        env: { NODE_ENV: "development" },
        versions: { node: "18.0.0" }
      } as any
    })

    it("should create warning functions for development environment", () => {
      const warnings = createFrameworkWarnings("nextjs")
      
      expect(typeof warnings.warnSSRUsage).toBe("function")
      expect(typeof warnings.warnHydrationMismatch).toBe("function")
    })

    it("should warn about SSR usage in development", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const warnings = createFrameworkWarnings("nextjs")
      
      warnings.warnSSRUsage("SSR is not configured properly")
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[nextjs] SSR is not configured properly")
      )
      
      consoleSpy.mockRestore()
    })

    it("should warn about hydration mismatches in development", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const warnings = createFrameworkWarnings("nextjs")
      
      const serverData = [{ id: 1 }, { id: 2 }]
      const clientData = [{ id: 1 }]
      
      warnings.warnHydrationMismatch(serverData, clientData)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Hydration mismatch detected")
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Server: 2 items, Client: 1 items")
      )
      
      consoleSpy.mockRestore()
    })

    it("should not warn about identical data", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const warnings = createFrameworkWarnings("nextjs")
      
      const data = [{ id: 1 }, { id: 2 }]
      
      warnings.warnHydrationMismatch(data, data)
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it("should not warn in production environment", () => {
      globalThis.process = {
        env: { NODE_ENV: "production" },
        versions: { node: "18.0.0" }
      } as any

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const warnings = createFrameworkWarnings("nextjs")
      
      warnings.warnSSRUsage("This should not appear")
      warnings.warnHydrationMismatch([1, 2], [1])
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })
})