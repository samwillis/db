import { performance, PerformanceObserver } from 'perf_hooks'
import type { MemorySnapshot, GCEvent } from './types.js'

export class PerformanceMonitor {
  private memorySnapshots: MemorySnapshot[] = []
  private gcEvents: GCEvent[] = []
  private observer: PerformanceObserver | null = null
  private memoryInterval: NodeJS.Timeout | null = null
  private isMonitoring = false

  constructor() {
    this.setupGCObserver()
  }

  private setupGCObserver() {
    try {
      this.observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.gcEvents.push({
              kind: (entry as any).kind,
              flag: (entry as any).flag,
              timestamp: entry.startTime,
              duration: entry.duration
            })
          }
        }
      })
      
      this.observer.observe({ entryTypes: ['gc'] })
    } catch (error) {
      console.warn('GC performance observer not available:', error)
    }
  }

  startMonitoring(intervalMs: number = 10) {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true
    this.memorySnapshots = []
    this.gcEvents = []

    // Take initial snapshot
    this.takeMemorySnapshot()

    // Set up periodic memory sampling
    this.memoryInterval = setInterval(() => {
      if (this.isMonitoring) {
        this.takeMemorySnapshot()
      }
    }, intervalMs)
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.memoryInterval) {
      clearInterval(this.memoryInterval)
      this.memoryInterval = null
    }

    // Take final snapshot
    this.takeMemorySnapshot()
  }

  private takeMemorySnapshot() {
    const memUsage = process.memoryUsage()
    this.memorySnapshots.push({
      used: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      timestamp: performance.now()
    })
  }

  getPeakMemoryUsage(): number {
    if (this.memorySnapshots.length === 0) {
      return 0
    }
    
    return Math.max(...this.memorySnapshots.map(snapshot => snapshot.used))
  }

  getMemoryDelta(): number {
    if (this.memorySnapshots.length < 2) {
      return 0
    }
    
    const first = this.memorySnapshots[0]!
    const last = this.memorySnapshots[this.memorySnapshots.length - 1]!
    return last.used - first.used
  }

  getGCStats(): { totalTime: number, count: number, events: GCEvent[] } {
    const totalTime = this.gcEvents.reduce((sum, event) => sum + event.duration, 0)
    return {
      totalTime,
      count: this.gcEvents.length,
      events: [...this.gcEvents]
    }
  }

  getMemorySnapshots(): MemorySnapshot[] {
    return [...this.memorySnapshots]
  }

  reset() {
    this.memorySnapshots = []
    this.gcEvents = []
  }

  destroy() {
    this.stopMonitoring()
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  // Force garbage collection if available (requires --expose-gc flag)
  forceGC() {
    if ((global as any).gc) {
      (global as any).gc()
    }
  }

  // Utility method to measure a function's performance
  async measureFunction<T>(
    fn: () => Promise<T> | T,
    options: { sampleMemory?: boolean, intervalMs?: number } = {}
  ): Promise<{
    result: T
    executionTime: number
    peakMemory: number
    memoryDelta: number
    gcStats: { totalTime: number, count: number, events: GCEvent[] }
  }> {
    const { sampleMemory = true, intervalMs = 10 } = options

    this.reset()

    if (sampleMemory) {
      this.startMonitoring(intervalMs)
    }

    const startTime = performance.now()
    const result = await fn()
    const endTime = performance.now()

    if (sampleMemory) {
      this.stopMonitoring()
    }

    const executionTime = endTime - startTime
    const peakMemory = sampleMemory ? this.getPeakMemoryUsage() : 0
    const memoryDelta = sampleMemory ? this.getMemoryDelta() : 0
    const gcStats = this.getGCStats()

    return {
      result,
      executionTime,
      peakMemory,
      memoryDelta,
      gcStats
    }
  }
}

// Global instance for easy access
export const performanceMonitor = new PerformanceMonitor()

// Utility function to format memory values
export function formatMemory(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`
}

// Utility function to format time values
export function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)} μs`
  } else if (ms < 1000) {
    return `${ms.toFixed(2)} ms`
  } else {
    return `${(ms / 1000).toFixed(2)} s`
  }
}

// Utility function to warm up the V8 engine
export async function warmUpV8() {
  // Perform some operations to warm up the JIT compiler
  const iterations = 10000
  let dummy = 0
  
  for (let i = 0; i < iterations; i++) {
    dummy += Math.random()
    dummy = dummy % 1000
  }
  
  // Small delay to allow JIT optimization
  await new Promise(resolve => setTimeout(resolve, 100))
  
  return dummy
}