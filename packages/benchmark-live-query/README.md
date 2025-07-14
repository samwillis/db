# @tanstack/benchmark-live-query

A comprehensive benchmarking suite for TanStack DB's live query system. This package tests and compares the performance of TanStack DB live queries against pure JavaScript implementations across various query types and complexities.

## Features

- 🔥 **Comprehensive Query Testing**: Tests 5 different query types from basic to complex aggregates
- ⚡ **Performance Metrics**: Tracks execution time, peak memory usage, and GC performance
- 📊 **Multiple Implementations**: Compares TanStack DB vs Pure JS vs Optimized JS implementations
- 🔄 **Incremental Updates**: Tests TanStack DB's incremental update performance
- 📈 **Rich Output Formats**: ASCII tables, JSON, and CSV output options
- 🧪 **Memory Stress Testing**: Advanced memory usage analysis
- 🎯 **Configurable Data Size**: Scale from 1K to 1M+ records

## Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build
```

## Usage

### Command Line Interface

```bash
# Basic usage
npx benchmark-live-query

# Custom configuration
npx benchmark-live-query --records 50000 --updates 20 --queries basic,join-with-aggregate --format table --verbose

# Export results
npx benchmark-live-query --records 10000 --queries basic,simple-join,complex-aggregate --format json --output results.json

# Memory stress testing
npx benchmark-live-query --records 25000 --queries complex-aggregate --memory-stress --verbose
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --records <number>` | Number of records to generate | `10000` |
| `-u, --updates <number>` | Number of incremental updates | `10` |
| `-q, --queries <queries>` | Comma-separated query types | `basic,simple-join` |
| `-f, --format <format>` | Output format (table/json/csv) | `table` |
| `-v, --verbose` | Verbose output | `false` |
| `-o, --output <file>` | Output file path | stdout |
| `--memory-stress` | Run memory stress tests | `false` |
| `--comparative` | Run comparative benchmarks | `false` |

### Programmatic Usage

```typescript
import { BenchmarkEngine, DataGenerator } from '@tanstack/benchmark-live-query'

const engine = new BenchmarkEngine()
const results = await engine.runBenchmarks({
  records: 10000,
  updates: 10,
  queries: ['basic', 'simple-join', 'complex-aggregate'],
  format: 'table',
  verbose: true
})

console.log(results)
```

## Query Types

### 1. Basic Query
**Description**: Single source with WHERE clause and SELECT projection
**Example**: Get active users with their basic information
```sql
SELECT id, name, email FROM users WHERE active = true
```

### 2. Basic with Order
**Description**: Basic query with ORDER BY and LIMIT for pagination
**Example**: Get 30 most recent active users
```sql
SELECT id, name, email, created_at FROM users 
WHERE active = true 
ORDER BY created_at DESC 
LIMIT 30
```

### 3. Simple Join
**Description**: LEFT JOIN between two tables
**Example**: Comments with user information
```sql
SELECT c.id, c.content, u.name, u.email 
FROM comments c 
LEFT JOIN users u ON c.user_id = u.id
```

### 4. Join with Aggregate
**Description**: JOIN with aggregate functions
**Example**: Issue count by user
```sql
SELECT i.id, i.title, i.status, COUNT(c.id) as comment_count
FROM issues i 
LEFT JOIN comments c ON i.id = c.issue_id 
GROUP BY i.id
```

### 5. Complex Aggregate
**Description**: Complex statistical aggregates across multiple tables
**Example**: Department analytics with user counts and budget calculations
```sql
SELECT d.id, d.name, COUNT(u.id) as user_count, 
       AVG(d.budget) as avg_budget, SUM(d.budget) as total_budget
FROM departments d 
INNER JOIN users u ON d.id = u.department_id 
GROUP BY d.id
```

## Implementation Comparison

### TanStack DB Implementations

1. **TanStack Initial**: First-time query execution using live queries
2. **TanStack Incremental**: Performance after incremental updates (the key metric)

### JavaScript Implementations

1. **Pure JS**: Nested loops and basic JavaScript operations
2. **Optimized JS**: Uses Maps, Sets, and optimized algorithms for better performance

## Performance Metrics

- **Execution Time**: Time taken to execute the query (milliseconds)
- **Peak Memory**: Maximum memory usage during execution (bytes)
- **GC Time**: Time spent in garbage collection (milliseconds)  
- **GC Count**: Number of garbage collection events
- **Result Count**: Number of records returned

## Data Model

The benchmark uses a realistic data model with proper relationships:

```typescript
interface User {
  id: number
  name: string
  email: string
  department_id: number
  active: boolean
  created_at: string
}

interface Comment {
  id: number
  content: string
  user_id: number
  issue_id: number
  created_at: string
}

interface Issue {
  id: number
  title: string
  description: string
  status: 'open' | 'in-progress' | 'closed'
  assigned_user_id: number | null
  created_at: string
}

interface Department {
  id: number
  name: string
  budget: number
}
```

## Sample Output

```
🔥 TanStack DB Live Query Benchmarks
Records: 10,000, Updates: 10
Data Generation: 45.23ms, Memory: 12.45 MB

📊 Basic Query (WHERE + SELECT)
┌──────────────────┬────────────────┬──────────────┬────────────┬──────────┬────────────┐
│ Implementation   │ Execution Time │ Peak Memory  │ GC Time    │ GC Count │ Result Count │
├──────────────────┼────────────────┼──────────────┼────────────┼──────────┼────────────┤
│ TanStack Initial │ 2.45ms         │ 1.23 MB      │ 0.12ms     │ 1        │ 9,000      │
│ TanStack Incremental │ 0.85ms    │ 0.89 MB      │ 0.05ms     │ 0        │ 9,010      │
│ Pure JS          │ 15.67ms        │ 2.34 MB      │ 0.45ms     │ 2        │ 9,000      │
│ Optimized JS     │ 8.23ms         │ 1.78 MB      │ 0.23ms     │ 1        │ 9,000      │
└──────────────────┴────────────────┴──────────────┴────────────┴──────────┴────────────┘

💡 Performance Comparisons:
   TanStack Initial is 6.40x faster than Pure JS
   TanStack Initial is 3.36x faster than Optimized JS
   TanStack Incremental is 2.88x faster than Initial
```

## Best Practices

### Running Benchmarks

1. **Consistent Environment**: Run benchmarks on the same machine with consistent load
2. **Warm-up**: The tool automatically warms up the V8 engine before benchmarking
3. **Multiple Runs**: Run multiple times and average results for accuracy
4. **Memory Monitoring**: Use `--memory-stress` for detailed memory analysis
5. **GC Optimization**: Run with `--expose-gc` Node.js flag for accurate GC measurement

### Interpreting Results

- **TanStack Incremental** performance is the key metric - this shows live query efficiency
- **Memory usage** is crucial for large datasets - watch for memory leaks
- **GC pressure** indicates allocation patterns - lower is better
- **Result count** should be consistent across implementations

## Advanced Usage

### Memory Stress Testing

```bash
npx benchmark-live-query --records 100000 --queries complex-aggregate --memory-stress --verbose
```

### Comparative Analysis

```bash
npx benchmark-live-query --records 50000 --queries basic,simple-join,complex-aggregate --comparative --format json --output benchmark-results.json
```

### Custom Data Sizes

```bash
# Small dataset (fast testing)
npx benchmark-live-query --records 1000 --queries basic,simple-join

# Large dataset (production-like)
npx benchmark-live-query --records 1000000 --queries basic --updates 100 --verbose
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.