import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createCollection } from "@tanstack/db"
import { useLiveQuery } from "../../src/useLiveQuery"
import { mockSyncCollectionOptions } from "../../../db/tests/utls"

type Todo = {
  id: string
  text: string
  completed: boolean
  createdAt: Date
}

const initialTodos: Array<Todo> = [
  {
    id: "1",
    text: "First todo",
    completed: false,
    createdAt: new Date("2023-01-01"),
  },
  {
    id: "2", 
    text: "Second todo",
    completed: true,
    createdAt: new Date("2023-01-02"),
  },
  {
    id: "3",
    text: "Third todo", 
    completed: false,
    createdAt: new Date("2023-01-03"),
  },
]

describe("useLiveQuery SSR", () => {
  let originalWindow: typeof globalThis.window

  beforeEach(() => {
    originalWindow = globalThis.window
  })

  afterEach(() => {
    globalThis.window = originalWindow
  })

  describe("Server Environment Detection", () => {
    it("should detect server environment when window is undefined", () => {
      // @ts-ignore - intentionally delete window for testing
      delete globalThis.window

      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-detection-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [initialTodos[0]],
            enableSSR: true,
          }
        )
      )

      // In SSR mode, should return the initial data immediately
      expect(result.current.data).toEqual([initialTodos[0]])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isReady).toBe(true)
      expect(result.current.collection).toBe(null)
    })

    it("should not use SSR when enableSSR is false", () => {
      // @ts-ignore - intentionally delete window for testing
      delete globalThis.window

      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-disabled-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [initialTodos[0]],
            enableSSR: false, // Explicitly disabled
          }
        )
      )

      // Should behave like normal client-side hook
      expect(result.current.collection).not.toBe(null)
      expect(result.current.collection).toBeDefined()
    })

    it("should work normally in client environment even with SSR options", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "client-with-ssr-options-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [initialTodos[0]],
            enableSSR: true, // Should be ignored in client
          }
        )
      )

      // In client environment, should work normally
      await waitFor(() => {
        expect(result.current.data.length).toBe(3) // All todos from collection
      })
      
      expect(result.current.collection).not.toBe(null)
      expect(result.current.isReady).toBe(true)
    })
  })

  describe("SSR Response Creation", () => {
    beforeEach(() => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
    })

    it("should create proper SSR response with initial data", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-response-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: initialTodos.slice(0, 2),
            enableSSR: true,
          }
        )
      )

      expect(result.current.data).toEqual(initialTodos.slice(0, 2))
      expect(result.current.state.size).toBe(2)
      expect(result.current.state.get(0)).toEqual(initialTodos[0])
      expect(result.current.state.get(1)).toEqual(initialTodos[1])
      expect(result.current.collection).toBe(null)
      expect(result.current.status).toBe("ready")
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isReady).toBe(true)
      expect(result.current.isIdle).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(result.current.isCleanedUp).toBe(false)
    })

    it("should create loading SSR response when no initial data", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-loading-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            enableSSR: true,
            // No initialData provided
          }
        )
      )

      expect(result.current.data).toEqual([])
      expect(result.current.state.size).toBe(0)
      expect(result.current.collection).toBe(null)
      expect(result.current.status).toBe("loading")
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isReady).toBe(false)
    })

    it("should handle empty initial data array", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-empty-data-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [],
            enableSSR: true,
          }
        )
      )

      expect(result.current.data).toEqual([])
      expect(result.current.state.size).toBe(0)
      expect(result.current.collection).toBe(null)
      expect(result.current.status).toBe("ready")
      expect(result.current.isReady).toBe(true)
    })
  })

  describe("Deferred Sync", () => {
    beforeEach(() => {
      // Restore window for client-side tests
      globalThis.window = originalWindow
    })

    it("should defer sync when deferSync option is true", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "deferred-sync-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      // Mock startSyncImmediate to track if it's called
      const startSyncSpy = vi.spyOn(collection, "startSyncImmediate")

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: initialTodos.slice(0, 1),
            deferSync: true,
          }
        )
      )

      // Sync should not be started immediately when deferSync is true
      expect(startSyncSpy).not.toHaveBeenCalled()

      // Should still return data normally after sync eventually starts
      await waitFor(() => {
        expect(result.current.data.length).toBeGreaterThan(0)
      })
    })

    it("should start sync immediately when deferSync is false", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "immediate-sync-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      // Mock startSyncImmediate to track if it's called
      const startSyncSpy = vi.spyOn(collection, "startSyncImmediate")

      renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: initialTodos.slice(0, 1),
            deferSync: false,
          }
        )
      )

      // Sync should be started immediately
      expect(startSyncSpy).toHaveBeenCalled()
    })

    it("should start sync when no deferSync option provided", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "default-sync-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const startSyncSpy = vi.spyOn(collection, "startSyncImmediate")

      renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: initialTodos.slice(0, 1),
            // No deferSync option - should default to starting sync
          }
        )
      )

      expect(startSyncSpy).toHaveBeenCalled()
    })
  })

  describe("Function Overloads", () => {
    beforeEach(() => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
    })

    it("should work with query function and SSR options", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "overload-function-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [initialTodos[0]],
            enableSSR: true,
          }
        )
      )

      expect(result.current.data).toEqual([initialTodos[0]])
      expect(result.current.collection).toBe(null)
    })

    it("should work with config object and SSR options", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "overload-config-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          {
            query: (q) => q.from({ todos: collection }),
          },
          [],
          {
            initialData: [initialTodos[0]],
            enableSSR: true,
          }
        )
      )

      expect(result.current.data).toEqual([initialTodos[0]])
      expect(result.current.collection).toBe(null)
    })

    it("should work with pre-created collection and SSR options", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "overload-collection-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(collection, {
          initialData: [initialTodos[0]],
          enableSSR: true,
        })
      )

      expect(result.current.data).toEqual([initialTodos[0]])
      expect(result.current.collection).toBe(null)
    })
  })

  describe("Complex Data Types in SSR", () => {
    beforeEach(() => {
      // @ts-ignore - simulate server environment
      delete globalThis.window
    })

    it("should handle Date objects in initial data", () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "ssr-dates-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [
              {
                id: "date-test",
                text: "Date test",
                completed: false,
                createdAt: new Date("2023-12-25"),
              },
            ],
            enableSSR: true,
          }
        )
      )

      expect(result.current.data[0].createdAt).toBeInstanceOf(Date)
      expect(result.current.data[0].createdAt.getFullYear()).toBe(2023)
    })

    it("should handle nested objects in initial data", () => {
      type ComplexTodo = Todo & {
        metadata: {
          priority: number
          tags: string[]
        }
      }

      const collection = createCollection(
        mockSyncCollectionOptions<ComplexTodo>({
          id: "ssr-complex-test",
          getKey: (todo) => todo.id,
          initialData: [],
        })
      )

      const complexData: ComplexTodo = {
        id: "complex",
        text: "Complex todo",
        completed: false,
        createdAt: new Date(),
        metadata: {
          priority: 1,
          tags: ["urgent", "work"],
        },
      }

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            initialData: [complexData],
            enableSSR: true,
          }
        )
      )

      expect(result.current.data[0].metadata.tags).toEqual(["urgent", "work"])
      expect(result.current.data[0].metadata.priority).toBe(1)
    })
  })

  describe("Error Handling", () => {
    it("should handle missing SSR options gracefully", async () => {
      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "no-ssr-options-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery((q) => q.from({ todos: collection }))
      )

      // Should work normally without SSR options
      await waitFor(() => {
        expect(result.current.data.length).toBe(3)
      })
      expect(result.current.collection).not.toBe(null)
    })

    it("should handle invalid initial data gracefully", () => {
      // @ts-ignore - simulate server environment
      delete globalThis.window

      const collection = createCollection(
        mockSyncCollectionOptions<Todo>({
          id: "invalid-data-test",
          getKey: (todo) => todo.id,
          initialData: initialTodos,
        })
      )

      const { result } = renderHook(() =>
        useLiveQuery(
          (q) => q.from({ todos: collection }),
          [],
          {
            // @ts-ignore - intentionally invalid data for testing
            initialData: null,
            enableSSR: true,
          }
        )
      )

      // Should handle null/invalid data gracefully
      expect(result.current.data).toEqual([])
      expect(result.current.isLoading).toBe(true)
    })
  })
})