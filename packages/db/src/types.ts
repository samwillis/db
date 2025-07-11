import type { IStreamBuilder } from "@electric-sql/d2mini"
import type { Collection } from "./collection"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Transaction } from "./transactions"
import type { BasicExpression } from "./query/ir"
import type { SingleRowRefProxy } from "./query/builder/ref-proxy"

/**
 * Helper type to extract the output type from a standard schema
 *
 * @internal This is used by the type resolution system
 */
export type InferSchemaOutput<T> = T extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<T> extends object
    ? StandardSchemaV1.InferOutput<T>
    : Record<string, unknown>
  : Record<string, unknown>

/**
 * Helper type to determine the final type based on priority:
 * 1. Explicit generic TExplicit (if not 'unknown')
 * 2. Schema output type (if schema provided)
 * 3. Fallback type TFallback
 *
 * @remarks
 * This type is used internally to resolve the collection item type based on the provided generics and schema.
 * Users should not need to use this type directly, but understanding the priority order helps when defining collections.
 */
export type ResolveType<
  TExplicit,
  TSchema extends StandardSchemaV1 = never,
  TFallback extends object = Record<string, unknown>,
> = unknown extends TExplicit
  ? [TSchema] extends [never]
    ? TFallback
    : InferSchemaOutput<TSchema>
  : TExplicit extends object
    ? TExplicit
    : Record<string, unknown>

export type TransactionState = `pending` | `persisting` | `completed` | `failed`

/**
 * Represents a utility function that can be attached to a collection
 */
export type Fn = (...args: Array<any>) => any

/**
 * A record of utility functions that can be attached to a collection
 */
export type UtilsRecord = Record<string, Fn>

/**
 * Represents a pending mutation within a transaction
 * Contains information about the original and modified data, as well as metadata
 */
export interface PendingMutation<
  T extends object = Record<string, unknown>,
  TOperation extends OperationType = OperationType,
> {
  mutationId: string
  original: TOperation extends `insert` ? {} : T
  modified: T
  changes: TOperation extends `insert`
    ? T
    : TOperation extends `delete`
      ? T
      : Partial<T>
  globalKey: string
  key: any
  type: OperationType
  metadata: unknown
  syncMetadata: Record<string, unknown>
  /** Whether this mutation should be applied optimistically (defaults to true) */
  optimistic: boolean
  createdAt: Date
  updatedAt: Date
  collection: Collection<T, any, any>
}

/**
 * Configuration options for creating a new transaction
 */
export type MutationFnParams<T extends object = Record<string, unknown>> = {
  transaction: TransactionWithMutations<T>
}

export type MutationFn<T extends object = Record<string, unknown>> = (
  params: MutationFnParams<T>
) => Promise<any>

/**
 * Represents a non-empty array (at least one element)
 */
export type NonEmptyArray<T> = [T, ...Array<T>]

/**
 * Utility type for a Transaction with at least one mutation
 * This is used internally by the Transaction.commit method
 */
export type TransactionWithMutations<
  T extends object = Record<string, unknown>,
  TOperation extends OperationType = OperationType,
> = Transaction<T, TOperation> & {
  mutations: NonEmptyArray<PendingMutation<T, TOperation>>
}

export interface TransactionConfig<T extends object = Record<string, unknown>> {
  /** Unique identifier for the transaction */
  id?: string
  /* If the transaction should autocommit after a mutate call or should commit be called explicitly */
  autoCommit?: boolean
  mutationFn: MutationFn<T>
  /** Custom metadata to associate with the transaction */
  metadata?: Record<string, unknown>
}

/**
 * Options for the createOptimisticAction helper
 */
export interface CreateOptimisticActionsOptions<TVars = unknown>
  extends Omit<TransactionConfig, `mutationFn`> {
  /** Function to apply optimistic updates locally before the mutation completes */
  onMutate: (vars: TVars) => void
  /** Function to execute the mutation on the server */
  mutationFn: (vars: TVars, params: MutationFnParams) => Promise<any>
}

export type { Transaction }

type Value<TExtensions = never> =
  | string
  | number
  | boolean
  | bigint
  | null
  | TExtensions
  | Array<Value<TExtensions>>
  | { [key: string | number | symbol]: Value<TExtensions> }

export type Row<TExtensions = never> = Record<string, Value<TExtensions>>

export type OperationType = `insert` | `update` | `delete`

export interface SyncConfig<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
> {
  sync: (params: {
    collection: Collection<T, TKey>
    begin: () => void
    write: (message: Omit<ChangeMessage<T>, `key`>) => void
    commit: () => void
  }) => void

  /**
   * Get the sync metadata for insert operations
   * @returns Record containing relation information
   */
  getSyncMetadata?: () => Record<string, unknown>

  /**
   * The row update mode used to sync to the collection.
   * @default `partial`
   * @description
   * - `partial`: Updates contain only the changes to the row.
   * - `full`: Updates contain the entire row.
   */
  rowUpdateMode?: `partial` | `full`
}

export interface ChangeMessage<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
> {
  key: TKey
  value: T
  previousValue?: T
  type: OperationType
  metadata?: Record<string, unknown>
}

export interface OptimisticChangeMessage<
  T extends object = Record<string, unknown>,
> extends ChangeMessage<T> {
  // Is this change message part of an active transaction. Only applies to optimistic changes.
  isActive?: boolean
}

/**
 * The Standard Schema interface.
 * This follows the standard-schema specification: https://github.com/standard-schema/standard-schema
 */
export type StandardSchema<T> = StandardSchemaV1 & {
  "~standard": {
    types?: {
      input: T
      output: T
    }
  }
}

/**
 * Type alias for StandardSchema
 */
export type StandardSchemaAlias<T = unknown> = StandardSchema<T>

export interface OperationConfig {
  metadata?: Record<string, unknown>
  /** Whether to apply optimistic updates immediately. Defaults to true. */
  optimistic?: boolean
}

export interface InsertConfig {
  metadata?: Record<string, unknown>
  /** Whether to apply optimistic updates immediately. Defaults to true. */
  optimistic?: boolean
}

export type UpdateMutationFnParams<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = {
  transaction: TransactionWithMutations<T, `update`>
  collection: Collection<T, TKey, TUtils>
}

export type InsertMutationFnParams<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = {
  transaction: TransactionWithMutations<T, `insert`>
  collection: Collection<T, TKey, TUtils>
}

export type DeleteMutationFnParams<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = {
  transaction: TransactionWithMutations<T, `delete`>
  collection: Collection<T, TKey, TUtils>
}

export type InsertMutationFn<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = (params: InsertMutationFnParams<T, TKey, TUtils>) => Promise<any>

export type UpdateMutationFn<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = (params: UpdateMutationFnParams<T, TKey, TUtils>) => Promise<any>

export type DeleteMutationFn<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = Record<string, Fn>,
> = (params: DeleteMutationFnParams<T, TKey, TUtils>) => Promise<any>

/**
 * Collection status values for lifecycle management
 * @example
 * // Check collection status
 * if (collection.status === "loading") {
 *   console.log("Collection is loading initial data")
 * } else if (collection.status === "ready") {
 *   console.log("Collection is ready for use")
 * }
 *
 * @example
 * // Status transitions
 * // idle → loading → initialCommit → ready
 * // Any status can transition to → error or cleaned-up
 */
export type CollectionStatus =
  /** Collection is created but sync hasn't started yet (when startSync config is false) */
  | `idle`
  /** Sync has started but hasn't received the first commit yet */
  | `loading`
  /** Collection is in the process of committing its first transaction */
  | `initialCommit`
  /** Collection has received at least one commit and is ready for use */
  | `ready`
  /** An error occurred during sync initialization */
  | `error`
  /** Collection has been cleaned up and resources freed */
  | `cleaned-up`

export interface CollectionConfig<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  // If an id isn't passed in, a UUID will be
  // generated for it.
  id?: string
  sync: SyncConfig<T, TKey>
  schema?: TSchema
  /**
   * Function to extract the ID from an object
   * This is required for update/delete operations which now only accept IDs
   * @param item The item to extract the ID from
   * @returns The ID string for the item
   * @example
   * // For a collection with a 'uuid' field as the primary key
   * getKey: (item) => item.uuid
   */
  getKey: (item: T) => TKey
  /**
   * Time in milliseconds after which the collection will be garbage collected
   * when it has no active subscribers. Defaults to 5 minutes (300000ms).
   */
  gcTime?: number
  /**
   * Whether to start syncing immediately when the collection is created.
   * Defaults to false for lazy loading. Set to true to immediately sync.
   */
  startSync?: boolean
  /**
   * Optional function to compare two items.
   * This is used to order the items in the collection.
   * @param x The first item to compare
   * @param y The second item to compare
   * @returns A number indicating the order of the items
   * @example
   * // For a collection with a 'createdAt' field
   * compare: (x, y) => x.createdAt.getTime() - y.createdAt.getTime()
   */
  compare?: (x: T, y: T) => number
  /**
   * Optional asynchronous handler function called before an insert operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   * @example
   * // Basic insert handler
   * onInsert: async ({ transaction, collection }) => {
   *   const newItem = transaction.mutations[0].modified
   *   await api.createTodo(newItem)
   * }
   *
   * @example
   * // Insert handler with multiple items
   * onInsert: async ({ transaction, collection }) => {
   *   const items = transaction.mutations.map(m => m.modified)
   *   await api.createTodos(items)
   * }
   *
   * @example
   * // Insert handler with error handling
   * onInsert: async ({ transaction, collection }) => {
   *   try {
   *     const newItem = transaction.mutations[0].modified
   *     const result = await api.createTodo(newItem)
   *     return result
   *   } catch (error) {
   *     console.error('Insert failed:', error)
   *     throw error // This will cause the transaction to fail
   *   }
   * }
   *
   * @example
   * // Insert handler with metadata
   * onInsert: async ({ transaction, collection }) => {
   *   const mutation = transaction.mutations[0]
   *   await api.createTodo(mutation.modified, {
   *     source: mutation.metadata?.source,
   *     timestamp: mutation.createdAt
   *   })
   * }
   */
  onInsert?: InsertMutationFn<T, TKey>
  /**
   * Optional asynchronous handler function called before an update operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   * @example
   * // Basic update handler
   * onUpdate: async ({ transaction, collection }) => {
   *   const updatedItem = transaction.mutations[0].modified
   *   await api.updateTodo(updatedItem.id, updatedItem)
   * }
   *
   * @example
   * // Update handler with partial updates
   * onUpdate: async ({ transaction, collection }) => {
   *   const mutation = transaction.mutations[0]
   *   const changes = mutation.changes // Only the changed fields
   *   await api.updateTodo(mutation.original.id, changes)
   * }
   *
   * @example
   * // Update handler with multiple items
   * onUpdate: async ({ transaction, collection }) => {
   *   const updates = transaction.mutations.map(m => ({
   *     id: m.key,
   *     changes: m.changes
   *   }))
   *   await api.updateTodos(updates)
   * }
   *
   * @example
   * // Update handler with optimistic rollback
   * onUpdate: async ({ transaction, collection }) => {
   *   const mutation = transaction.mutations[0]
   *   try {
   *     await api.updateTodo(mutation.original.id, mutation.changes)
   *   } catch (error) {
   *     // Transaction will automatically rollback optimistic changes
   *     console.error('Update failed, rolling back:', error)
   *     throw error
   *   }
   * }
   */
  onUpdate?: UpdateMutationFn<T, TKey>
  /**
   * Optional asynchronous handler function called before a delete operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   * @example
   * // Basic delete handler
   * onDelete: async ({ transaction, collection }) => {
   *   const deletedKey = transaction.mutations[0].key
   *   await api.deleteTodo(deletedKey)
   * }
   *
   * @example
   * // Delete handler with multiple items
   * onDelete: async ({ transaction, collection }) => {
   *   const keysToDelete = transaction.mutations.map(m => m.key)
   *   await api.deleteTodos(keysToDelete)
   * }
   *
   * @example
   * // Delete handler with confirmation
   * onDelete: async ({ transaction, collection }) => {
   *   const mutation = transaction.mutations[0]
   *   const shouldDelete = await confirmDeletion(mutation.original)
   *   if (!shouldDelete) {
   *     throw new Error('Delete cancelled by user')
   *   }
   *   await api.deleteTodo(mutation.original.id)
   * }
   *
   * @example
   * // Delete handler with optimistic rollback
   * onDelete: async ({ transaction, collection }) => {
   *   const mutation = transaction.mutations[0]
   *   try {
   *     await api.deleteTodo(mutation.original.id)
   *   } catch (error) {
   *     // Transaction will automatically rollback optimistic changes
   *     console.error('Delete failed, rolling back:', error)
   *     throw error
   *   }
   * }
   */
  onDelete?: DeleteMutationFn<T, TKey>
}

export type ChangesPayload<T extends object = Record<string, unknown>> = Array<
  ChangeMessage<T>
>

/**
 * An input row from a collection
 */
export type InputRow = [unknown, Record<string, unknown>]

/**
 * A keyed stream is a stream of rows
 * This is used as the inputs from a collection to a query
 */
export type KeyedStream = IStreamBuilder<InputRow>

/**
 * Result stream type representing the output of compiled queries
 * Always returns [key, [result, orderByIndex]] where orderByIndex is undefined for unordered queries
 */
export type ResultStream = IStreamBuilder<[unknown, [any, string | undefined]]>

/**
 * A namespaced row is a row withing a pipeline that had each table wrapped in its alias
 */
export type NamespacedRow = Record<string, Record<string, unknown>>

/**
 * A keyed namespaced row is a row with a key and a namespaced row
 * This is the main representation of a row in a query pipeline
 */
export type KeyedNamespacedRow = [unknown, NamespacedRow]

/**
 * A namespaced and keyed stream is a stream of rows
 * This is used throughout a query pipeline and as the output from a query without
 * a `select` clause.
 */
export type NamespacedAndKeyedStream = IStreamBuilder<KeyedNamespacedRow>

/**
 * Index configuration options
 */
export interface IndexOptions {
  /** Optional name for the index, used for referencing and debugging */
  name?: string
}

/**
 * Represents an index for fast lookups on a collection
 * All indexes are ordered to support range queries
 */
export interface CollectionIndex<
  TKey extends string | number = string | number,
> {
  /** Unique identifier for this index */
  id: string
  /** Optional name for the index */
  name?: string
  /** The expression that defines what to index (a Ref expression) */
  expression: BasicExpression
  /** Ordered array of [indexedValue, Set<TKey>] pairs, sorted by indexedValue */
  orderedEntries: Array<[any, Set<TKey>]>
  /** Map from indexed value to Set of keys for fast equality lookups */
  valueMap: Map<any, Set<TKey>>
  /** Set of all keys that have been indexed */
  indexedKeys: Set<TKey>
  /** Comparison function used for ordering */
  compareFn: (a: any, b: any) => number
}

/**
 * Options for subscribing to collection changes
 */
export interface SubscribeChangesOptions<
  T extends object = Record<string, unknown>,
> {
  /** Whether to include the current state as initial changes */
  includeInitialState?: boolean
  /** Filter changes using a where expression */
  where?: (row: SingleRowRefProxy<T>) => any
}

/**
 * Options for getting current state as changes
 */
export interface CurrentStateAsChangesOptions<
  T extends object = Record<string, unknown>,
> {
  /** Filter the current state using a where expression */
  where?: (row: SingleRowRefProxy<T>) => any
}

/**
 * Function type for listening to collection changes
 * @param changes - Array of change messages describing what happened
 * @example
 * // Basic change listener
 * const listener: ChangeListener = (changes) => {
 *   changes.forEach(change => {
 *     console.log(`${change.type}: ${change.key}`, change.value)
 *   })
 * }
 *
 * collection.subscribeChanges(listener)
 *
 * @example
 * // Handle different change types
 * const listener: ChangeListener<Todo> = (changes) => {
 *   for (const change of changes) {
 *     switch (change.type) {
 *       case 'insert':
 *         addToUI(change.value)
 *         break
 *       case 'update':
 *         updateInUI(change.key, change.value, change.previousValue)
 *         break
 *       case 'delete':
 *         removeFromUI(change.key)
 *         break
 *     }
 *   }
 * }
 */
export type ChangeListener<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
> = (changes: Array<ChangeMessage<T, TKey>>) => void
