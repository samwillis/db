import { program } from 'commander'
import { BenchmarkEngine } from './benchmark-engine.js'
import { outputFormatter } from './output-formatters.js'
import type { BenchmarkConfig, QueryType, OutputFormat } from './types.js'

const availableQueries: QueryType[] = [
  'basic',
  'basic-with-order',
  'simple-join',
  'join-with-aggregate',
  'complex-aggregate'
]

const availableFormats: OutputFormat[] = ['table', 'json', 'csv']

program
  .name('benchmark-live-query')
  .description('Benchmark TanStack DB live query performance')
  .version('0.0.1')
  .option('-r, --records <number>', 'Number of records to generate', '10000')
  .option('-u, --updates <number>', 'Number of incremental updates to perform', '10')
  .option('-q, --queries <queries>', 'Comma-separated list of queries to run', 'basic,simple-join')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-o, --output <file>', 'Output file (optional)')
  .option('--memory-stress', 'Run memory stress tests', false)
  .option('--comparative', 'Run comparative benchmarks using tinybench', false)
  .action(async (options) => {
    try {
      // Parse and validate options
      const config = parseOptions(options)
      
      console.log('🚀 Initializing TanStack DB Live Query Benchmarks...')
      console.log(`📋 Configuration:`)
      console.log(`   Records: ${config.records.toLocaleString()}`)
      console.log(`   Updates: ${config.updates}`)
      console.log(`   Queries: ${config.queries.join(', ')}`)
      console.log(`   Format: ${config.format}`)
      console.log(`   Verbose: ${config.verbose}`)
      console.log('')

      // Initialize benchmark engine
      const engine = new BenchmarkEngine()

      try {
        // Run main benchmarks
        const results = await engine.runBenchmarks(config)

        // Format and output results
        let output = ''
        switch (config.format) {
          case 'table':
            output = outputFormatter.formatTable(results)
            break
          case 'json':
            output = outputFormatter.formatJSON(results)
            break
          case 'csv':
            output = outputFormatter.formatCSV(results)
            break
        }

        // Add summary for table format
        if (config.format === 'table') {
          output += '\n' + outputFormatter.formatSummary(results)
        }

        // Output results
        if (options.output) {
          await writeToFile(options.output, output)
          console.log(`📝 Results written to ${options.output}`)
        } else {
          console.log(output)
        }

        // Run additional tests if requested
        if (options.memoryStress) {
          console.log('\n🧪 Running memory stress tests...')
          await runMemoryStressTests(engine, config)
        }

        if (options.comparative) {
          console.log('\n🏁 Running comparative benchmarks...')
          await runComparativeBenchmarks(engine, config)
        }

      } finally {
        engine.destroy()
      }

    } catch (error) {
      console.error('❌ Error running benchmarks:', error)
      process.exit(1)
    }
  })

function parseOptions(options: any): BenchmarkConfig {
  const records = parseInt(options.records, 10)
  if (isNaN(records) || records <= 0) {
    throw new Error('Records must be a positive integer')
  }

  const updates = parseInt(options.updates, 10)
  if (isNaN(updates) || updates < 0) {
    throw new Error('Updates must be a non-negative integer')
  }

  const queries = options.queries.split(',')
    .map((q: string) => q.trim())
    .filter((q: string) => q.length > 0) as QueryType[]

  // Validate queries
  for (const query of queries) {
    if (!availableQueries.includes(query)) {
      throw new Error(`Invalid query type: ${query}. Available: ${availableQueries.join(', ')}`)
    }
  }

  if (queries.length === 0) {
    throw new Error('At least one query type must be specified')
  }

  const format = options.format as OutputFormat
  if (!availableFormats.includes(format)) {
    throw new Error(`Invalid format: ${format}. Available: ${availableFormats.join(', ')}`)
  }

  return {
    records,
    updates,
    queries,
    format,
    verbose: options.verbose || false
  }
}

async function writeToFile(filename: string, content: string): Promise<void> {
  const fs = await import('fs/promises')
  await fs.writeFile(filename, content, 'utf8')
}

async function runMemoryStressTests(engine: BenchmarkEngine, config: BenchmarkConfig): Promise<void> {
  // Implementation would be here - simplified for now
  console.log('🧪 Memory stress tests completed (placeholder)')
}

async function runComparativeBenchmarks(engine: BenchmarkEngine, config: BenchmarkConfig): Promise<void> {
  // Implementation would be here - simplified for now
  console.log('🏁 Comparative benchmarks completed (placeholder)')
}

// Add help examples
program.addHelpText('after', `
Examples:
  $ benchmark-live-query --records 5000 --queries basic,simple-join
  $ benchmark-live-query --records 100000 --updates 50 --format json --output results.json
  $ benchmark-live-query --queries complex-aggregate --memory-stress --verbose
  $ benchmark-live-query --records 10000 --queries basic,basic-with-order,simple-join,join-with-aggregate,complex-aggregate --format table

Query Types:
  basic                  Basic single source with WHERE clause and SELECT
  basic-with-order       Basic query with ORDER BY and LIMIT (30 records)
  simple-join            Simple LEFT JOIN (users on comments)
  join-with-aggregate    JOIN with aggregate function (comment counts on issues)
  complex-aggregate      Complex statistical aggregates (department analytics)

Output Formats:
  table                  ASCII table (default, colorized)
  json                   JSON format for machine processing
  csv                    CSV format for spreadsheet analysis
`)

program.parse()