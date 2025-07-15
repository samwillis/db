---
"@tanstack/db": minor
---

Add join type aliases to query builder

Added convenience methods for different join types:
- `leftJoin()` - alias for `join(source, callback, 'left')`
- `rightJoin()` - alias for `join(source, callback, 'right')` 
- `innerJoin()` - alias for `join(source, callback, 'inner')`
- `fullJoin()` - alias for `join(source, callback, 'full')`

These aliases provide the same type inference and optionality handling as the main `join()` method, making it easier to write queries with explicit join types.