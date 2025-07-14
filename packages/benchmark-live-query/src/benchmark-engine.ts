import { Bench } from 'tinybench'
import { DataGenerator } from './data-generator.js'
import { PerformanceMonitor, warmUpV8 } from './performance-monitor.js'
import { allQueryImplementations } from './query-implementations.js'
import type { 
  BenchmarkConfig, 
  BenchmarkResults, 
  QueryResult, 
  QueryType 
} from './types.js'

export class BenchmarkEngine {
  private dataGenerator = new DataGenerator()
  private performanceMonitor = new PerformanceMonitor()

  async runBenchmarks(config: BenchmarkConfig): Promise<BenchmarkResults> {
    console.log('🔥 Starting TanStack DB Live Query Benchmarks')
    console.log(`📊 Config: ${config.records} records, ${config.updates} updates`)
    
    // Warm up V8 engine
    console.log('🔄 Warming up V8 engine...')
    await warmUpV8()

    // Generate test data
    console.log('📝 Generating test data...')
    const dataGenStart = performance.now()
    const data = this.dataGenerator.generate(config.records)
    const dataGenEnd = performance.now()

    const dataGenerationTime = dataGenEnd - dataGenStart
    const initialMemory = process.memoryUsage().heapUsed

    console.log(`✅ Generated ${data.users.length} users, ${data.comments.length} comments, ${data.issues.length} issues, ${data.departments.length} departments`)
    console.log(`⏱️  Data generation took ${dataGenerationTime.toFixed(2)}ms`)

    // Run benchmarks for each query type
    const results: QueryResult[] = []

    for (const queryType of config.queries) {
      console.log(`\n🧪 Running benchmarks for ${queryType}...`)
      
      const queryResults = await this.runQueryTypeBenchmarks(
        queryType,
        data,
        config
      )
      
      results.push(...queryResults)
    }

    return {
      config,
      dataGeneration: {
        time: dataGenerationTime,
        memory: initialMemory
      },
      results
    }
  }

  private async runQueryTypeBenchmarks(
    queryType: QueryType,
    data: ReturnType<typeof this.dataGenerator.generate>,
    config: BenchmarkConfig
  ): Promise<QueryResult[]> {
    const implementations = allQueryImplementations[queryType]
    const results: QueryResult[] = []

    // Generate incremental updates for live query testing
    const updates = this.dataGenerator.generateIncrementalUpdates(data, config.updates)

    for (const [implKey, implementation] of Object.entries(implementations)) {
      console.log(`  📈 Testing ${implementation.name}...`)

      try {
        // Test initial execution
        const initialResult = await this.measureQueryExecution(
          () => implementation.execute(data),
          `${queryType}-${implKey}-initial`
        )

        results.push({
          queryType,
          implementation: implKey === 'tanstack-db' ? 'tanstack-initial' : (implKey as any),
          executionTime: initialResult.executionTime,
          peakMemory: initialResult.peakMemory,
          gcTime: initialResult.gcStats.totalTime,
          gcCount: initialResult.gcStats.count,
          resultCount: initialResult.result.resultCount
        })

        // Test incremental updates for TanStack DB
        if (implKey === 'tanstack-db' && implementation.executeIncremental) {
          const incrementalResult = await this.measureQueryExecution(
            () => implementation.executeIncremental!(data, updates),
            `${queryType}-${implKey}-incremental`
          )

          results.push({
            queryType,
            implementation: 'tanstack-incremental',
            executionTime: incrementalResult.executionTime,
            peakMemory: incrementalResult.peakMemory,
            gcTime: incrementalResult.gcStats.totalTime,
            gcCount: incrementalResult.gcStats.count,
            resultCount: incrementalResult.result.resultCount
          })
        }

        if (config.verbose) {
          console.log(`    ⚡ ${implementation.name}: ${initialResult.executionTime.toFixed(2)}ms`)
        }

      } catch (error) {
        console.error(`    ❌ Error testing ${implementation.name}:`, error)
        
        // Add error result
        results.push({
          queryType,
          implementation: implKey === 'tanstack-db' ? 'tanstack-initial' : (implKey as any),
          executionTime: -1,
          peakMemory: -1,
          gcTime: -1,
          gcCount: -1,
          resultCount: -1
        })
      }
    }

    return results
  }

  private async measureQueryExecution<T>(
    queryFn: () => Promise<T> | T,
    name: string
  ): Promise<{
    result: T
    executionTime: number
    peakMemory: number
    gcStats: { totalTime: number, count: number }
  }> {
    // Force GC before measurement
    this.performanceMonitor.forceGC()
    
    // Small delay to let GC complete
    await new Promise(resolve => setTimeout(resolve, 10))

    const measurement = await this.performanceMonitor.measureFunction(
      queryFn,
      { sampleMemory: true, intervalMs: 5 }
    )

    return {
      result: measurement.result,
      executionTime: measurement.executionTime,
      peakMemory: measurement.peakMemory,
      gcStats: measurement.gcStats
    }
  }

  // Run comparative benchmarks using tinybench
  async runComparativeBenchmarks(
    queryType: QueryType,
    data: ReturnType<typeof this.dataGenerator.generate>,
    iterations: number = 10
  ): Promise<{
    queryType: QueryType
    results: Array<{
      name: string
      hz: number
      mean: number
      variance: number
      samples: number[]
    }>
  }> {
    const implementations = allQueryImplementations[queryType]
    const bench = new Bench({ iterations })

    console.log(`🏁 Running comparative benchmark for ${queryType} (${iterations} iterations)...`)

    // Add each implementation to the benchmark
    for (const [implKey, implementation] of Object.entries(implementations)) {
      bench.add(`${queryType}-${implKey}`, async () => {
        await implementation.execute(data)
      })
    }

    // Run the benchmark
    await bench.run()

    const results = bench.tasks.map(task => ({
      name: task.name,
      hz: task.result?.hz || 0,
      mean: task.result?.mean || 0,
      variance: task.result?.variance || 0,
      samples: task.result?.samples || []
    }))

    return {
      queryType,
      results
    }
  }

  // Memory stress test
  async runMemoryStressTest(
    queryType: QueryType,
    data: ReturnType<typeof this.dataGenerator.generate>,
    iterations: number = 100
  ): Promise<{
    queryType: QueryType
    results: Array<{
      implementation: string
      maxMemory: number
      avgMemory: number
      memoryGrowth: number
      gcEvents: number
    }>
  }> {
    const implementations = allQueryImplementations[queryType]
    const results: Array<{
      implementation: string
      maxMemory: number
      avgMemory: number
      memoryGrowth: number
      gcEvents: number
    }> = []

    console.log(`💾 Running memory stress test for ${queryType} (${iterations} iterations)...`)

    for (const [implKey, implementation] of Object.entries(implementations)) {
      console.log(`  🧪 Testing ${implementation.name} memory usage...`)

      const memorySnapshots: number[] = []

      this.performanceMonitor.reset()
      this.performanceMonitor.startMonitoring(5)

      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < iterations; i++) {
        await implementation.execute(data)
        memorySnapshots.push(process.memoryUsage().heapUsed)
        
        if (i % 10 === 0) {
          this.performanceMonitor.forceGC()
          await new Promise(resolve => setTimeout(resolve, 5))
        }
      }

      this.performanceMonitor.stopMonitoring()
      const gcStats = this.performanceMonitor.getGCStats()

      const maxMemory = Math.max(...memorySnapshots)
      const avgMemory = memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length
      const finalMemory = process.memoryUsage().heapUsed
      const memoryGrowth = finalMemory - initialMemory

      results.push({
        implementation: implKey,
        maxMemory,
        avgMemory,
        memoryGrowth,
        gcEvents: gcStats.count
      })

      // Force cleanup
      this.performanceMonitor.forceGC()
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    return {
      queryType,
      results
    }
  }

  destroy() {
    this.performanceMonitor.destroy()
  }
}