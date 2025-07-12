import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { 
  executeQueryOnServer,
  isServerEnvironment,
  detectFramework,
  supportsSSR
} from "../../src/server/simple-executor.js"
import { createCollection } from "../../src/collection.js"
import { mockSyncCollectionOptions } from "../utls.js"

type Todo = {
  id: string
  text: string
  completed: boolean
}

const mockTodos: Array<Todo> = [
  { id: "1", text: "First todo", completed: false },
  { id: "2", text: "Second todo", completed: true },
  { id: "3", text: "Third todo", completed: false },
]

describe("Simple SSR Executor", () => {
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

  describe("executeQueryOnServer", () => {
    it("should execute a query and return placeholder result", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "test-todos",
          getKey: (todo) => todo.id,
          initialData: mockTodos,
        })
      )

      const result = await executeQueryOnServer((q) =>
        q.from({ todos: collection })
      )

      // Current implementation returns empty array as placeholder
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    it("should handle complex queries", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "test-todos-complex",
          getKey: (todo) => todo.id,
          initialData: mockTodos,
        })
      )

      const result = await executeQueryOnServer((q) =>
        q.from({ todos: collection })
         .where(({ todos }) => todos.completed === false)
         .select(({ todos }) => ({ id: todos.id, text: todos.text }))
      )

      // Current implementation returns empty array regardless of query complexity
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    it("should log execution in placeholder implementation", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {})
      
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "test-todos-logging",
          getKey: (todo) => todo.id,
          initialData: mockTodos,
        })
      )

      await executeQueryOnServer((q) => q.from({ todos: collection }))

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("executeQueryOnServer called (placeholder implementation)")
      )

      consoleSpy.mockRestore()
    })
  })

  describe("Environment Detection", () => {
    it("should detect server environment when window is undefined", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      
      expect(isServerEnvironment()).toBe(true)
    })

    it("should detect client environment when window is defined", () => {
      // Normal browser environment
      expect(isServerEnvironment()).toBe(false)
    })
  })

  describe("Framework Detection", () => {
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

    it("should return unknown when no framework is detected", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = {
        env: { NODE_ENV: "development" },
        versions: { node: "18.0.0" }
      } as any

      expect(detectFramework()).toBe("unknown")
    })

    it("should return unknown in client environment", () => {
      // Client environment
      expect(detectFramework()).toBe("unknown")
    })
  })

  describe("SSR Support Detection", () => {
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

    it("should not support SSR when process is undefined", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
      globalThis.process = undefined as any

      expect(supportsSSR()).toBe(false)
    })
  })

  describe("Error Handling", () => {
    it("should handle query execution errors gracefully", async () => {
      // Test with invalid query function
      const result = await executeQueryOnServer(null as any)

      // Should still return empty array even with invalid input
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    it("should handle missing collection gracefully", async () => {
      const result = await executeQueryOnServer((q) =>
        q.from({ nonexistent: null as any })
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })
  })
})