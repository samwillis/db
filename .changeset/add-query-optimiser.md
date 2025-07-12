---
"@tanstack/db": patch
---

Fix overly aggressive query optimizer safety check

The optimizer can now optimize queries with aggregates, ORDER BY, and HAVING clauses by creating new subqueries, while still preventing unsafe pushdown into existing subqueries.