import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { 
  NextjsSSRAdapter,
  createNextjsAdapter,
  executeQueryInServerComponent,
  executeQueryInGetServerSideProps,
  executeQueryInGetStaticProps
} from "../../src/adapters/nextjs.js"

describe("Next.js SSR Adapter", () => {
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

  describe("NextjsSSRAdapter", () => {
    let adapter: NextjsSSRAdapter

    beforeEach(() => {
      adapter = new NextjsSSRAdapter()
    })

    describe("Environment Detection", () => {
      it("should detect Next.js environment from NEXT_RUNTIME", () => {
        globalThis.process = {
          env: { NEXT_RUNTIME: "nodejs" }
        } as any

        expect(adapter.isNextjsEnvironment()).toBe(true)
      })

      it("should detect Next.js environment from client-side __NEXT_DATA__", () => {
        globalThis.window = {
          ...originalWindow,
          __NEXT_DATA__: { page: "/" }
        } as any

        expect(adapter.isNextjsEnvironment()).toBe(true)
      })

      it("should not detect Next.js environment when indicators are missing", () => {
        globalThis.process = {
          env: {}
        } as any

        expect(adapter.isNextjsEnvironment()).toBe(false)
      })

      it("should detect Edge Runtime", () => {
        globalThis.process = {
          env: { NEXT_RUNTIME: "edge" }
        } as any

        expect(adapter.isEdgeRuntime()).toBe(true)
      })

      it("should not detect Edge Runtime in Node.js", () => {
        globalThis.process = {
          env: { NEXT_RUNTIME: "nodejs" }
        } as any

        expect(adapter.isEdgeRuntime()).toBe(false)
      })

      it("should detect Server Component context", () => {
        // @ts-ignore - simulate server environment
        delete globalThis.window
        globalThis.process = {
          env: { NEXT_RUNTIME: "nodejs" }
        } as any

        expect(adapter.isServerComponent()).toBe(true)
      })

      it("should not detect Server Component in client", () => {
        globalThis.process = {
          env: { NEXT_RUNTIME: "nodejs" }
        } as any

        expect(adapter.isServerComponent()).toBe(false)
      })
    })

    describe("Query Execution", () => {
      it("should execute query in Server Component", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        
        const mockQuery = vi.fn()
        const result = await adapter.executeInServerComponent(mockQuery as any)

        expect(Array.isArray(result)).toBe(true)
        expect(result).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Executing query in Server Component")
        )

        consoleSpy.mockRestore()
      })

      it("should execute query in getServerSideProps", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        
        const mockQuery = vi.fn()
        const result = await adapter.executeInGetServerSideProps(mockQuery as any)

        expect(Array.isArray(result)).toBe(true)
        expect(result).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Executing query in getServerSideProps")
        )

        consoleSpy.mockRestore()
      })

      it("should execute query in getStaticProps", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        
        const mockQuery = vi.fn()
        const result = await adapter.executeInGetStaticProps(mockQuery as any)

        expect(Array.isArray(result)).toBe(true)
        expect(result).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Executing query in getStaticProps")
        )

        consoleSpy.mockRestore()
      })
    })

    describe("Data Serialization", () => {
      it("should serialize data for Next.js", () => {
        const data = {
          id: 1,
          name: "test",
          nested: { value: 42 }
        }

        const serialized = adapter.serializeData(data)

        expect(serialized).toEqual(data)
        expect(typeof serialized).toBe("object")
      })

      it("should handle complex data types in serialization", () => {
        const data = {
          date: new Date("2023-01-01"),
          bigInt: BigInt(123),
          regex: /test/gi
        }

        const serialized = adapter.serializeData(data)

        // Next.js serialization converts complex types to strings
        expect(typeof serialized.date).toBe("string")
        expect(typeof serialized.bigInt).toBe("string")
        expect(typeof serialized.regex).toBe("object")
      })

      it("should create SSR props", () => {
        const data = [
          { id: 1, name: "Item 1" },
          { id: 2, name: "Item 2" }
        ]

        const props = adapter.createSSRProps(data)

        expect(props).toHaveProperty("initialData")
        expect(props).toHaveProperty("enableSSR")
        expect(props.initialData).toEqual(data)
        expect(props.enableSSR).toBe(true)
      })
    })
  })

  describe("Factory Functions", () => {
    it("should create Next.js adapter", () => {
      const adapter = createNextjsAdapter()
      
      expect(adapter).toBeInstanceOf(NextjsSSRAdapter)
    })

    it("should execute query in Server Component via helper", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      
      const mockQuery = vi.fn()
      const result = await executeQueryInServerComponent(mockQuery as any)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Executing query in Server Component")
      )

      consoleSpy.mockRestore()
    })

    it("should execute query in getServerSideProps via helper", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      
      const mockQuery = vi.fn()
      const result = await executeQueryInGetServerSideProps(mockQuery as any)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Executing query in getServerSideProps")
      )

      consoleSpy.mockRestore()
    })

    it("should execute query in getStaticProps via helper", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      
      const mockQuery = vi.fn()
      const result = await executeQueryInGetStaticProps(mockQuery as any)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Executing query in getStaticProps")
      )

      consoleSpy.mockRestore()
    })
  })

  describe("Error Handling", () => {
    let adapter: NextjsSSRAdapter

    beforeEach(() => {
      adapter = new NextjsSSRAdapter()
    })

    it("should handle missing process gracefully", () => {
      globalThis.process = undefined as any

      expect(adapter.isNextjsEnvironment()).toBe(false)
      expect(adapter.isEdgeRuntime()).toBe(false)
    })

    it("should handle missing window gracefully", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: {}
      } as any

      expect(adapter.isNextjsEnvironment()).toBe(false)
    })

    it("should handle invalid data in serialization", () => {
      const circularRef: any = { name: "test" }
      circularRef.self = circularRef

      // Should not throw error even with circular references
      expect(() => {
        adapter.serializeData(circularRef)
      }).not.toThrow()
    })

    it("should handle null/undefined data", () => {
      expect(adapter.serializeData(null)).toBe(null)
      expect(adapter.serializeData(undefined)).toBeUndefined()
    })
  })

  describe("Integration Scenarios", () => {
    let adapter: NextjsSSRAdapter

    beforeEach(() => {
      adapter = new NextjsSSRAdapter()
    })

    it("should work in Next.js App Router scenario", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "nodejs" }
      } as any

      expect(adapter.isNextjsEnvironment()).toBe(true)
      expect(adapter.isServerComponent()).toBe(true)
      expect(adapter.isEdgeRuntime()).toBe(false)
    })

    it("should work in Next.js Edge Runtime scenario", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NEXT_RUNTIME: "edge" }
      } as any

      expect(adapter.isNextjsEnvironment()).toBe(true)
      expect(adapter.isServerComponent()).toBe(true)
      expect(adapter.isEdgeRuntime()).toBe(true)
    })

    it("should work in Next.js client-side scenario", () => {
      globalThis.window = {
        ...originalWindow,
        __NEXT_DATA__: { page: "/", query: {}, buildId: "test" }
      } as any

      expect(adapter.isNextjsEnvironment()).toBe(true)
      expect(adapter.isServerComponent()).toBe(false)
      expect(adapter.isEdgeRuntime()).toBe(false)
    })

    it("should work in non-Next.js environment", () => {
      globalThis.process = {
        env: {}
      } as any

      expect(adapter.isNextjsEnvironment()).toBe(false)
      expect(adapter.isServerComponent()).toBe(false)
      expect(adapter.isEdgeRuntime()).toBe(false)
    })
  })
})