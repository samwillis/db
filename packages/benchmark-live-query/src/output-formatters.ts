import Table from 'cli-table3'
import chalk from 'chalk'
import { formatMemory, formatTime } from './performance-monitor.js'
import type { BenchmarkResults, QueryResult, QueryType } from './types.js'

export class OutputFormatter {
  formatTable(results: BenchmarkResults): string {
    const output: string[] = []
    
    // Header
    output.push(chalk.bold.blue('🔥 TanStack DB Live Query Benchmarks'))
    output.push(chalk.gray(`Records: ${results.config.records.toLocaleString()}, Updates: ${results.config.updates}`))
    output.push(chalk.gray(`Data Generation: ${formatTime(results.dataGeneration.time)}, Memory: ${formatMemory(results.dataGeneration.memory)}`))
    output.push('')

    // Group results by query type
    const groupedResults = this.groupResultsByQueryType(results.results)

    for (const [queryType, queryResults] of Object.entries(groupedResults)) {
      output.push(chalk.bold.yellow(`📊 ${this.getQueryTypeDisplayName(queryType as QueryType)}`))
      
      const table = new Table({
        head: [
          chalk.bold('Implementation'),
          chalk.bold('Execution Time'),
          chalk.bold('Peak Memory'),
          chalk.bold('GC Time'),
          chalk.bold('GC Count'),
          chalk.bold('Result Count')
        ],
        colWidths: [18, 16, 14, 12, 10, 12]
      })

      // Sort results to show TanStack initial, then incremental, then others
      const sortedResults = this.sortResultsForDisplay(queryResults)

      for (const result of sortedResults) {
        const row = [
          this.formatImplementationName(result.implementation),
          this.formatExecutionTime(result.executionTime),
          formatMemory(result.peakMemory),
          formatTime(result.gcTime),
          result.gcCount.toString(),
          result.resultCount.toLocaleString()
        ]
        table.push(row)
      }

      output.push(table.toString())
      output.push('')

      // Add performance comparison
      const comparison = this.generatePerformanceComparison(queryResults)
      if (comparison) {
        output.push(comparison)
        output.push('')
      }
    }

    return output.join('\n')
  }

  formatJSON(results: BenchmarkResults): string {
    return JSON.stringify(results, null, 2)
  }

  formatCSV(results: BenchmarkResults): string {
    const headers = [
      'Query Type',
      'Implementation',
      'Execution Time (ms)',
      'Peak Memory (bytes)',
      'GC Time (ms)',
      'GC Count',
      'Result Count'
    ]

    const rows = results.results.map(result => [
      result.queryType,
      result.implementation,
      result.executionTime.toString(),
      result.peakMemory.toString(),
      result.gcTime.toString(),
      result.gcCount.toString(),
      result.resultCount.toString()
    ])

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }

  private groupResultsByQueryType(results: QueryResult[]): Record<string, QueryResult[]> {
    const grouped: Record<string, QueryResult[]> = {}
    
    for (const result of results) {
      if (!grouped[result.queryType]) {
        grouped[result.queryType] = []
      }
      grouped[result.queryType]!.push(result)
    }

    return grouped
  }

  private sortResultsForDisplay(results: QueryResult[]): QueryResult[] {
    const order = ['tanstack-initial', 'tanstack-incremental', 'pure-js', 'optimized-js']
    
    return results.sort((a, b) => {
      const indexA = order.indexOf(a.implementation)
      const indexB = order.indexOf(b.implementation)
      
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      
      return indexA - indexB
    })
  }

  private formatImplementationName(implementation: string): string {
    const colorMap = {
      'tanstack-initial': chalk.bold.green('TanStack Initial'),
      'tanstack-incremental': chalk.bold.cyan('TanStack Incremental'),
      'pure-js': chalk.yellow('Pure JS'),
      'optimized-js': chalk.blue('Optimized JS')
    }

    return colorMap[implementation as keyof typeof colorMap] || implementation
  }

  private formatExecutionTime(timeMs: number): string {
    if (timeMs < 0) return chalk.red('ERROR')
    
    const formatted = formatTime(timeMs)
    
    if (timeMs < 1) {
      return chalk.green(formatted)
    } else if (timeMs < 10) {
      return chalk.yellow(formatted)
    } else {
      return chalk.red(formatted)
    }
  }

  private getQueryTypeDisplayName(queryType: QueryType): string {
    const displayNames = {
      'basic': 'Basic Query (WHERE + SELECT)',
      'basic-with-order': 'Basic Query with ORDER BY + LIMIT',
      'simple-join': 'Simple LEFT JOIN',
      'join-with-aggregate': 'JOIN with Aggregate (COUNT)',
      'complex-aggregate': 'Complex Statistical Aggregates'
    }

    return displayNames[queryType] || queryType
  }

  private generatePerformanceComparison(results: QueryResult[]): string | null {
    if (results.length < 2) return null

    const validResults = results.filter(r => r.executionTime >= 0)
    if (validResults.length < 2) return null

    const tanstackInitial = validResults.find(r => r.implementation === 'tanstack-initial')
    const tanstackIncremental = validResults.find(r => r.implementation === 'tanstack-incremental')
    const pureJS = validResults.find(r => r.implementation === 'pure-js')
    const optimizedJS = validResults.find(r => r.implementation === 'optimized-js')

    const comparisons: string[] = []

    if (tanstackInitial && pureJS) {
      const speedup = pureJS.executionTime / tanstackInitial.executionTime
      const color = speedup > 1 ? chalk.green : chalk.red
      comparisons.push(`${color(`TanStack Initial is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than Pure JS`)}`)
    }

    if (tanstackInitial && optimizedJS) {
      const speedup = optimizedJS.executionTime / tanstackInitial.executionTime
      const color = speedup > 1 ? chalk.green : chalk.red
      comparisons.push(`${color(`TanStack Initial is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than Optimized JS`)}`)
    }

    if (tanstackIncremental && tanstackInitial) {
      const speedup = tanstackInitial.executionTime / tanstackIncremental.executionTime
      const color = speedup > 1 ? chalk.green : chalk.red
      comparisons.push(`${color(`TanStack Incremental is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than Initial`)}`)
    }

    if (pureJS && optimizedJS) {
      const speedup = pureJS.executionTime / optimizedJS.executionTime
      const color = speedup > 1 ? chalk.green : chalk.red
      comparisons.push(`${color(`Optimized JS is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than Pure JS`)}`)
    }

    if (comparisons.length === 0) return null

    return chalk.bold('💡 Performance Comparisons:\n') + comparisons.map(c => `   ${c}`).join('\n')
  }

  formatSummary(results: BenchmarkResults): string {
    const output: string[] = []
    
    output.push(chalk.bold.blue('📈 Benchmark Summary'))
    output.push('')

    // Overall stats
    const allResults = results.results.filter(r => r.executionTime >= 0)
    const totalQueries = allResults.length
    const avgExecutionTime = allResults.reduce((sum, r) => sum + r.executionTime, 0) / totalQueries
    const totalMemory = allResults.reduce((sum, r) => sum + r.peakMemory, 0)
    const totalGCTime = allResults.reduce((sum, r) => sum + r.gcTime, 0)

    output.push(chalk.yellow(`Total Queries Executed: ${totalQueries}`))
    output.push(chalk.yellow(`Average Execution Time: ${formatTime(avgExecutionTime)}`))
    output.push(chalk.yellow(`Total Memory Used: ${formatMemory(totalMemory)}`))
    output.push(chalk.yellow(`Total GC Time: ${formatTime(totalGCTime)}`))
    output.push('')

    // Best performing queries
    const bestPerformers = this.findBestPerformers(results.results)
    if (bestPerformers.length > 0) {
      output.push(chalk.bold.green('🏆 Best Performers:'))
      for (const performer of bestPerformers) {
        output.push(`   ${performer.queryType}: ${this.formatImplementationName(performer.implementation)} (${formatTime(performer.executionTime)})`)
      }
      output.push('')
    }

    // Worst performing queries
    const worstPerformers = this.findWorstPerformers(results.results)
    if (worstPerformers.length > 0) {
      output.push(chalk.bold.red('🐌 Needs Improvement:'))
      for (const performer of worstPerformers) {
        output.push(`   ${performer.queryType}: ${this.formatImplementationName(performer.implementation)} (${formatTime(performer.executionTime)})`)
      }
      output.push('')
    }

    return output.join('\n')
  }

  private findBestPerformers(results: QueryResult[]): QueryResult[] {
    const validResults = results.filter(r => r.executionTime >= 0)
    const groupedByQuery = this.groupResultsByQueryType(validResults)
    
    const bestPerformers: QueryResult[] = []
    
    for (const [, queryResults] of Object.entries(groupedByQuery)) {
      const fastest = queryResults.reduce((best, current) => 
        current.executionTime < best.executionTime ? current : best
      )
      bestPerformers.push(fastest)
    }

    return bestPerformers.sort((a, b) => a.executionTime - b.executionTime)
  }

  private findWorstPerformers(results: QueryResult[]): QueryResult[] {
    const validResults = results.filter(r => r.executionTime >= 0)
    const groupedByQuery = this.groupResultsByQueryType(validResults)
    
    const worstPerformers: QueryResult[] = []
    
    for (const [, queryResults] of Object.entries(groupedByQuery)) {
      const slowest = queryResults.reduce((worst, current) => 
        current.executionTime > worst.executionTime ? current : worst
      )
      worstPerformers.push(slowest)
    }

    return worstPerformers.sort((a, b) => b.executionTime - a.executionTime)
  }
}

export const outputFormatter = new OutputFormatter()