import { describe, expect, it } from "vitest"
import { UniversalSerializer } from "../../src/server/serializer.js"

describe("UniversalSerializer", () => {
  describe("Basic Serialization", () => {
    it("should serialize and deserialize simple objects", () => {
      const data = { id: 1, name: "test", active: true }
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized).toEqual(data)
    })

    it("should handle null and undefined values", () => {
      const data = { value: null, undefined: undefined }
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.value).toBe(null)
      expect(deserialized.undefined).toBeUndefined()
    })

    it("should handle arrays", () => {
      const data = [1, 2, 3, "test", true]
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized).toEqual(data)
    })
  })

  describe("Date Serialization", () => {
    it("should serialize and deserialize Date objects", () => {
      const date = new Date("2023-12-25T10:30:00.000Z")
      const data = { createdAt: date, updatedAt: date }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.createdAt).toBeInstanceOf(Date)
      expect(deserialized.createdAt.getTime()).toBe(date.getTime())
      expect(deserialized.updatedAt).toBeInstanceOf(Date)
      expect(deserialized.updatedAt.getTime()).toBe(date.getTime())
    })

    it("should handle nested Date objects", () => {
      const data = {
        user: {
          profile: {
            birthDate: new Date("1990-01-01"),
          },
        },
        timestamps: [
          new Date("2023-01-01"),
          new Date("2023-12-31"),
        ],
      }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.user.profile.birthDate).toBeInstanceOf(Date)
      expect(deserialized.timestamps[0]).toBeInstanceOf(Date)
      expect(deserialized.timestamps[1]).toBeInstanceOf(Date)
    })
  })

  describe("BigInt Serialization", () => {
    it("should serialize and deserialize BigInt values", () => {
      const data = {
        largeNumber: BigInt("123456789012345678901234567890"),
        smallBigInt: BigInt(42),
      }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(typeof deserialized.largeNumber).toBe("bigint")
      expect(deserialized.largeNumber).toBe(BigInt("123456789012345678901234567890"))
      expect(typeof deserialized.smallBigInt).toBe("bigint")
      expect(deserialized.smallBigInt).toBe(BigInt(42))
    })
  })

  describe("RegExp Serialization", () => {
    it("should serialize and deserialize RegExp objects", () => {
      const data = {
        emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/gi,
        simpleRegex: /test/,
      }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.emailRegex).toBeInstanceOf(RegExp)
      expect(deserialized.emailRegex.source).toBe("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
      expect(deserialized.emailRegex.flags).toBe("gi")
      expect(deserialized.simpleRegex).toBeInstanceOf(RegExp)
      expect(deserialized.simpleRegex.source).toBe("test")
    })
  })

  describe("Set Serialization", () => {
    it("should serialize and deserialize Set objects", () => {
      const data = {
        tags: new Set(["urgent", "work", "important"]),
        numbers: new Set([1, 2, 3, 1, 2]), // Duplicates should be removed
      }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.tags).toBeInstanceOf(Set)
      expect(Array.from(deserialized.tags)).toEqual(["urgent", "work", "important"])
      expect(deserialized.numbers).toBeInstanceOf(Set)
      expect(Array.from(deserialized.numbers)).toEqual([1, 2, 3])
    })
  })

  describe("Map Serialization", () => {
    it("should serialize and deserialize Map objects", () => {
      const data = {
        userRoles: new Map<any, any>([
          ["user1", "admin"],
          ["user2", "viewer"],
          [123, "numeric-key"],
        ]),
      }
      
      const serialized = UniversalSerializer.serialize(data)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      expect(deserialized.userRoles).toBeInstanceOf(Map)
      expect(deserialized.userRoles.get("user1")).toBe("admin")
      expect(deserialized.userRoles.get("user2")).toBe("viewer")
      expect(deserialized.userRoles.get(123)).toBe("numeric-key")
    })
  })

  describe("Complex Nested Objects", () => {
    it("should handle complex nested structures with multiple data types", () => {
      const complexData = {
        id: 123,
        name: "Complex Object",
        metadata: {
          createdAt: new Date("2023-01-01T00:00:00.000Z"),
          updatedAt: new Date("2023-12-31T23:59:59.999Z"),
          version: BigInt(1),
          tags: new Set(["production", "critical"]),
          permissions: new Map([
            ["read", true],
            ["write", false],
          ]),
          patterns: {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^\+\d{1,3}\d{10}$/,
          },
        },
        stats: [
          { date: new Date("2023-01-01"), count: BigInt(100) },
          { date: new Date("2023-01-02"), count: BigInt(150) },
        ],
      }
      
      const serialized = UniversalSerializer.serialize(complexData)
      const deserialized = UniversalSerializer.deserialize(serialized)
      
      // Check basic properties
      expect(deserialized.id).toBe(123)
      expect(deserialized.name).toBe("Complex Object")
      
      // Check Date objects
      expect(deserialized.metadata.createdAt).toBeInstanceOf(Date)
      expect(deserialized.metadata.updatedAt).toBeInstanceOf(Date)
      
      // Check BigInt
      expect(typeof deserialized.metadata.version).toBe("bigint")
      expect(deserialized.metadata.version).toBe(BigInt(1))
      
      // Check Set
      expect(deserialized.metadata.tags).toBeInstanceOf(Set)
      expect(Array.from(deserialized.metadata.tags)).toEqual(["production", "critical"])
      
      // Check Map
      expect(deserialized.metadata.permissions).toBeInstanceOf(Map)
      expect(deserialized.metadata.permissions.get("read")).toBe(true)
      
      // Check RegExp
      expect(deserialized.metadata.patterns.email).toBeInstanceOf(RegExp)
      expect(deserialized.metadata.patterns.phone).toBeInstanceOf(RegExp)
      
      // Check nested arrays with complex types
      expect(deserialized.stats[0].date).toBeInstanceOf(Date)
      expect(typeof deserialized.stats[0].count).toBe("bigint")
      expect(deserialized.stats[1].date).toBeInstanceOf(Date)
      expect(typeof deserialized.stats[1].count).toBe("bigint")
    })
  })

  describe("Framework-Specific Serialization", () => {
    it("should serialize for Next.js", () => {
      const data = { 
        id: 1, 
        date: new Date("2023-01-01"),
        bigInt: BigInt(123)
      }
      
      const serialized = UniversalSerializer.serializeForNextjs(data)
      
      // Next.js serialization should return a plain object
      expect(typeof serialized).toBe("object")
      expect(serialized.id).toBe(1)
      // Complex types should be converted to JSON-serializable format
      expect(typeof serialized.date).toBe("string")
      expect(typeof serialized.bigInt).toBe("string")
    })

    it("should serialize and deserialize for TanStack Start", () => {
      const data = { 
        id: 1, 
        date: new Date("2023-01-01"),
        bigInt: BigInt(123)
      }
      
      const serialized = UniversalSerializer.serializeForTanStackStart(data)
      expect(serialized).toHaveProperty("__tanstack_data")
      expect(typeof serialized.__tanstack_data).toBe("string")
      
      const deserialized = UniversalSerializer.deserializeFromTanStackStart(serialized)
      expect(deserialized.id).toBe(1)
      expect(deserialized.date).toBeInstanceOf(Date)
      expect(typeof deserialized.bigInt).toBe("bigint")
    })
  })

  describe("Safe Serialization", () => {
    it("should handle circular references", () => {
      const obj: any = { name: "test" }
      obj.self = obj // Create circular reference
      
      const serialized = UniversalSerializer.safeSerialization(obj)
      const parsed = JSON.parse(serialized)
      
      expect(parsed.name).toBe("test")
      expect(parsed.self).toBe("[Circular]")
    })

    it("should handle deeply nested circular references", () => {
      const obj: any = { 
        level1: {
          level2: {
            name: "deep"
          }
        }
      }
      obj.level1.level2.circular = obj.level1 // Create circular reference
      
      const serialized = UniversalSerializer.safeSerialization(obj)
      const parsed = JSON.parse(serialized)
      
      expect(parsed.level1.level2.name).toBe("deep")
      expect(parsed.level1.level2.circular).toBe("[Circular]")
    })
  })

  describe("Error Handling", () => {
    it("should handle invalid JSON gracefully", () => {
      expect(() => {
        UniversalSerializer.deserialize("invalid json")
      }).toThrow()
    })

    it("should handle unknown type markers gracefully", () => {
      const data = JSON.stringify({
        value: { __type: "UnknownType", value: "test" }
      })
      
      const result = UniversalSerializer.deserialize(data)
      expect(result.value).toEqual({ __type: "UnknownType", value: "test" })
    })

    it("should handle malformed type objects", () => {
      const data = JSON.stringify({
        value: { __type: "Date" } // Missing value property
      })
      
      const result = UniversalSerializer.deserialize(data)
      expect(result.value).toEqual({ __type: "Date" })
    })
  })
})