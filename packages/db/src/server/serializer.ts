/**
 * Universal serializer for handling complex data types in SSR
 */
export class UniversalSerializer {
  /**
   * Serialize data for SSR, handling complex types like Date and BigInt
   */
  static serialize(data: any): string {
    return JSON.stringify(data, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() }
      }
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() }
      }
      if (value instanceof RegExp) {
        return { __type: 'RegExp', value: value.toString() }
      }
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) }
      }
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) }
      }
      return value
    })
  }

  /**
   * Deserialize data from SSR, reconstructing complex types
   */
  static deserialize(json: string): any {
    return JSON.parse(json, (key, value) => {
      if (value && typeof value === 'object' && value.__type) {
        switch (value.__type) {
          case 'Date':
            return new Date(value.value)
          case 'BigInt':
            return BigInt(value.value)
          case 'RegExp':
            const match = value.value.match(/^\/(.+)\/([gimuy]*)$/)
            return match ? new RegExp(match[1], match[2]) : new RegExp(value.value)
          case 'Set':
            return new Set(value.value)
          case 'Map':
            return new Map(value.value)
          default:
            return value
        }
      }
      return value
    })
  }

  /**
   * Serialize data for Next.js (uses built-in JSON serialization)
   */
  static serializeForNextjs(data: any): any {
    // Next.js handles most serialization automatically
    // We just need to ensure it's JSON serializable
    return JSON.parse(JSON.stringify(data))
  }

  /**
   * Serialize data for TanStack Start with metadata
   */
  static serializeForTanStackStart(data: any): { __tanstack_data: string } {
    return {
      __tanstack_data: this.serialize(data)
    }
  }

  /**
   * Deserialize data from TanStack Start
   */
  static deserializeFromTanStackStart(serialized: { __tanstack_data: string }): any {
    return this.deserialize(serialized.__tanstack_data)
  }

  /**
   * Create a safe serialization that handles circular references
   */
  static safeSerialization(data: any, maxDepth: number = 10): string {
    const seen = new WeakSet()
    
    return JSON.stringify(data, (key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      
      // Handle complex types
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() }
      }
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() }
      }
      
      return value
    })
  }
}