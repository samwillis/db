# Collection Indexing Implementation

## Overview

This document outlines the implementation of indexes for faster initial lookup in collections, completed in three phases as requested.

## Phase 1: ✅ Index Creation API

### Features Implemented

1. **Index Creation API**
   ```typescript
   // Create an index on a field
   const nameIndex = myCollection.createIndex((row) => row.field1)

   // With optional options object
   const namedIndex = myCollection.createIndex((row) => row.field1, {
     name: 'indexName'
   })
   ```

2. **Index Data Structures**
   - `CollectionIndex<T, TKey>` interface with:
     - `id`: Unique identifier
     - `name`: Optional name for debugging
     - `expression`: BasicExpression from IR system  
     - `indexFn`: Function to extract indexed value
     - `index`: Map from value to Set of keys
     - `indexedKeys`: Set of all indexed keys

3. **Index Maintenance**
   - Indexes are automatically maintained on insert/update/delete operations
   - Index updates happen in `emitEvents()` before change listeners are called
   - Supports simple property references like `(row) => row.fieldName`

4. **RefProxy Integration**
   - Uses the existing refProxy system to capture expressions
   - Converts callback expressions to `BasicExpression` using `toExpression()`
   - Currently supports simple property references only

### Implementation Details

- Added index storage to `CollectionImpl`: `private indexes = new Map<string, CollectionIndex<T, TKey>>()`
- Index building happens immediately when `createIndex()` is called
- Index maintenance integrated into change event processing
- Error handling: individual item indexing failures don't break the entire index

## Phase 2: ✅ Subscription API Updates

### Features Implemented

1. **Enhanced `subscribeChanges` API**
   ```typescript
   // Subscribe with where filter
   collection.subscribeChanges((changes) => {
     // Handle filtered changes
   }, {
     includeInitialState: true,
     where: (row) => row.status === 'active'
   })
   ```

2. **Enhanced `currentStateAsChanges` API**
   ```typescript
   // Get current state with filtering and index optimization
   const activeItems = collection.currentStateAsChanges({
     where: (row) => row.status === 'active'
   })
   ```

3. **Index-Optimized Filtering**
   - Automatically detects simple equality comparisons (`field === value`)
   - Uses existing indexes for fast lookup when possible
   - Falls back to full table scan for complex expressions
   - Supports both index-accelerated and filter-function approaches

4. **Filter Function Creation**
   - `createFilterFunction()` converts where callbacks to filter predicates
   - `createFilteredCallback()` wraps change listeners with filtering logic
   - Handles insert/update/delete change filtering appropriately

### Implementation Details

- New types: `SubscribeChangesOptions<T>` and `CurrentStateAsChangesOptions<T>`
- Index optimization detects patterns like `eq(field, value)` in IR
- Graceful fallback to full scan if index optimization fails
- Filtered callbacks ensure only matching changes reach subscribers

## Phase 3: 🔄 Live Query Integration (Next Steps)

### Planned Implementation

The next phase would involve:

1. **Where Clause Extraction from Live Queries**
   - Analyze `QueryIR.where` clauses in live query collections
   - Extract simple conditions that can be pushed down to collection subscriptions
   - Handle complex queries that span multiple collections

2. **Collection Subscription Integration**
   - Modify `liveQueryCollectionOptions()` to extract where clauses
   - Update collection subscriptions in live queries to use where filters
   - Optimize initial data loading using indexes

3. **Multi-Collection Query Optimization**
   - Coordinate where clause pushdown across joined collections
   - Handle cases where conditions span multiple tables
   - Maintain query correctness while optimizing performance

### Technical Approach

The implementation would:
1. Parse `query.where` arrays in live query compilation
2. Identify which conditions can be pushed to individual collections
3. Transform IR expressions to collection subscription where clauses
4. Update `sendChangesToInput()` to use filtered subscriptions

## Current Limitations

1. **Expression Support**: Only simple property references are supported in indexes (`row.field`)
2. **Index Optimization**: Only equality comparisons are optimized (`field === value`)
3. **Complex Expressions**: Functions, computed values, and complex expressions fall back to full scan
4. **Live Query Integration**: Not yet implemented (Phase 3)

## Future Enhancements

1. **Complex Expression Support**: Expand IR evaluation for computed indexes
2. **Multiple Index Types**: Range indexes, composite indexes, etc.
3. **Query Planner**: More sophisticated index selection and query optimization
4. **Index Statistics**: Track index usage and performance metrics

## Testing Requirements

The implementation should be tested with:
1. Basic index creation and usage
2. Index maintenance during collection mutations
3. Where clause filtering with and without indexes
4. Subscription filtering accuracy
5. Performance benchmarks comparing indexed vs. full-scan operations

## API Examples

```typescript
// Phase 1: Index Creation
const statusIndex = collection.createIndex((row) => row.status, { name: 'status' })
const nameIndex = collection.createIndex((row) => row.name)

// Phase 2: Filtered Subscriptions  
const unsubscribe = collection.subscribeChanges((changes) => {
  console.log('Active items changed:', changes)
}, {
  includeInitialState: true,
  where: (row) => row.status === 'active'
})

// Get current active items (will use statusIndex if available)
const activeItems = collection.currentStateAsChanges({
  where: (row) => row.status === 'active'
})

// Phase 3: Live Query Integration (planned)
const liveQuery = createLiveQueryCollection({
  query: (q) => q
    .from({ items: collection })
    .where(({ items }) => eq(items.status, 'active'))
    .select(({ items }) => items)
})
// Would automatically push where clause to collection subscription
```