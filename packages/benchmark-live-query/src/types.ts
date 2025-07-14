export interface User {
  id: number
  name: string
  email: string
  department_id: number
  active: boolean
  created_at: string
}

export interface Comment {
  id: number
  content: string
  user_id: number
  issue_id: number
  created_at: string
}

export interface Issue {
  id: number
  title: string
  description: string
  status: 'open' | 'in-progress' | 'closed'
  assigned_user_id: number | null
  created_at: string
}

export interface Department {
  id: number
  name: string
  budget: number
}

export interface BenchmarkConfig {
  records: number
  updates: number
  queries: QueryType[]
  format: OutputFormat
  verbose: boolean
}

export type QueryType = 
  | 'basic'
  | 'basic-with-order'
  | 'simple-join'
  | 'join-with-aggregate'
  | 'complex-aggregate'

export type OutputFormat = 'table' | 'json' | 'csv'

export interface QueryResult {
  queryType: QueryType
  implementation: 'tanstack-initial' | 'tanstack-incremental' | 'pure-js' | 'optimized-js'
  executionTime: number // milliseconds
  peakMemory: number // bytes
  gcTime: number // milliseconds
  gcCount: number
  resultCount: number
}

export interface BenchmarkResults {
  config: BenchmarkConfig
  dataGeneration: {
    time: number
    memory: number
  }
  results: QueryResult[]
}

export interface MemorySnapshot {
  used: number
  external: number
  arrayBuffers: number
  timestamp: number
}

export interface GCEvent {
  kind: number
  flag: number
  timestamp: number
  duration: number
}

export interface GeneratedData {
  users: User[]
  comments: Comment[]
  issues: Issue[]
  departments: Department[]
}