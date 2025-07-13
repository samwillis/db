---
"@tanstack/db": minor
---

Add collection index system for optimized queries and subscriptions

This release introduces a comprehensive index system for collections that enables fast lookups and query optimization:

**Index Creation**
- `collection.createIndex((row) => row.field)` - Create indexes on any field or expression
- Support for named indexes with `{ name: "indexName" }` option
- Automatic index maintenance during data changes

**Query Optimization**
- Simple queries (`eq`, `gt`, `gte`, `lt`, `lte`) automatically use indexes when available
- Complex queries with `and`, `or`, and `inArray` operations are optimized when all conditions can use indexes
- Intelligent fallback to full scan when optimization isn't possible
- Range queries like `and(gt(row.age, 25), lt(row.age, 35))` use index intersection

**Subscription Integration**
- Filtered subscriptions with `where` clauses automatically benefit from index optimization
- Initial state queries for subscriptions use indexes when available
- Significant performance improvement for large collections with filtered subscriptions

**Implementation Details**
- Ordered B-tree-like index structure for efficient range queries
- Dual data structure (ordered entries + value map) for optimal performance
- Comprehensive test coverage with index usage verification
- Type-safe query builder integration

Note: Live queries do not yet use this index system - that will be added in a future release.