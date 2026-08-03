import { describe, it, expect } from "vitest"
import { createGroupSchema, updateGroupSchema } from "@/lib/validations/group"

describe("createGroupSchema", () => {
  describe("valid inputs", () => {
    it("accepts minimal input (only name) and applies all defaults", () => {
      const result = createGroupSchema.safeParse({ name: "Trip" })
      expect(result.success).toBe(true)
      if (result.success) {
        // description is optional with no default → key is absent
        expect(result.data).toEqual({
          name: "Trip",
          type: "OTHER",
          currency: "RUB",
          memberIds: [],
        })
      }
    })

    it("accepts full input with all fields provided", () => {
      const input = {
        name: "Apartment",
        description: "Shared flat expenses",
        type: "HOME" as const,
        currency: "USD" as const,
        memberIds: ["u1", "u2", "u3"],
      }
      const result = createGroupSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(input)
      }
    })

    it("accepts an empty description string (optional, no min)", () => {
      const result = createGroupSchema.safeParse({ name: "X", description: "" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.description).toBe("")
      }
    })
  })

  describe("defaults", () => {
    it("defaults type to OTHER when omitted", () => {
      const result = createGroupSchema.safeParse({ name: "X" })
      expect(result.success && result.data.type).toBe("OTHER")
    })

    it("defaults currency to RUB when omitted", () => {
      const result = createGroupSchema.safeParse({ name: "X" })
      expect(result.success && result.data.currency).toBe("RUB")
    })

    it("defaults memberIds to an empty array when omitted", () => {
      const result = createGroupSchema.safeParse({ name: "X" })
      expect(result.success && result.data.memberIds).toEqual([])
    })
  })

  describe("required field: name", () => {
    it("rejects when name is missing", () => {
      const result = createGroupSchema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["name"])
        expect(result.error.issues[0].code).toBe("invalid_type")
      }
    })

    it("rejects an empty name with the custom message", () => {
      const result = createGroupSchema.safeParse({ name: "" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["name"])
        expect(result.error.issues[0].message).toBe("Название обязательно")
      }
    })

    it("rejects a non-string name", () => {
      expect(createGroupSchema.safeParse({ name: 123 }).success).toBe(false)
    })
  })

  describe("name length boundaries", () => {
    it("accepts a 1-char name (min)", () => {
      expect(createGroupSchema.safeParse({ name: "a" }).success).toBe(true)
    })

    it("accepts a 100-char name (max)", () => {
      expect(createGroupSchema.safeParse({ name: "a".repeat(100) }).success).toBe(true)
    })

    it("rejects a 101-char name (over max)", () => {
      expect(createGroupSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false)
    })
  })

  describe("description length boundaries", () => {
    it("accepts a 500-char description (max)", () => {
      const result = createGroupSchema.safeParse({ name: "X", description: "a".repeat(500) })
      expect(result.success).toBe(true)
    })

    it("rejects a 501-char description (over max)", () => {
      const result = createGroupSchema.safeParse({ name: "X", description: "a".repeat(501) })
      expect(result.success).toBe(false)
    })
  })

  describe("type enum", () => {
    it.each(["HOME", "TRIP", "COUPLE", "OTHER"])("accepts %s", (type) => {
      expect(createGroupSchema.safeParse({ name: "X", type }).success).toBe(true)
    })

    it("rejects an unknown type value", () => {
      expect(createGroupSchema.safeParse({ name: "X", type: "WORK" }).success).toBe(false)
    })

    it("rejects a lowercase type value", () => {
      expect(createGroupSchema.safeParse({ name: "X", type: "home" }).success).toBe(false)
    })
  })

  describe("currency enum", () => {
    it.each(["RUB", "USD", "EUR", "AMD", "GEL", "TRY", "INR"])("accepts %s", (currency) => {
      expect(createGroupSchema.safeParse({ name: "X", currency }).success).toBe(true)
    })

    it("rejects an unsupported currency", () => {
      expect(createGroupSchema.safeParse({ name: "X", currency: "XXX" }).success).toBe(false)
    })

    it("rejects a lowercase currency", () => {
      expect(createGroupSchema.safeParse({ name: "X", currency: "usd" }).success).toBe(false)
    })
  })

  describe("memberIds array", () => {
    it("accepts an array of strings", () => {
      const result = createGroupSchema.safeParse({ name: "X", memberIds: ["a", "b"] })
      expect(result.success && result.data.memberIds).toEqual(["a", "b"])
    })

    it("accepts an explicitly empty array", () => {
      const result = createGroupSchema.safeParse({ name: "X", memberIds: [] })
      expect(result.success && result.data.memberIds).toEqual([])
    })

    it("rejects an array containing a non-string element", () => {
      expect(createGroupSchema.safeParse({ name: "X", memberIds: ["a", 1] }).success).toBe(false)
    })

    it("rejects a non-array memberIds", () => {
      expect(createGroupSchema.safeParse({ name: "X", memberIds: "a" }).success).toBe(false)
    })
  })
})

describe("updateGroupSchema", () => {
  describe("valid inputs", () => {
    it("accepts an empty object (all fields optional)", () => {
      const result = updateGroupSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({})
      }
    })

    it("accepts only name", () => {
      const result = updateGroupSchema.safeParse({ name: "New Name" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: "New Name" })
      }
    })

    it("accepts only description", () => {
      const result = updateGroupSchema.safeParse({ description: "desc" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ description: "desc" })
      }
    })

    it("accepts both name and description", () => {
      const input = { name: "New", description: "d" }
      const result = updateGroupSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(input)
      }
    })
  })

  describe("name boundaries (when provided)", () => {
    it("rejects an empty name with the custom message", () => {
      const result = updateGroupSchema.safeParse({ name: "" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Название обязательно")
      }
    })

    it("accepts a 100-char name (max)", () => {
      expect(updateGroupSchema.safeParse({ name: "a".repeat(100) }).success).toBe(true)
    })

    it("rejects a 101-char name (over max)", () => {
      expect(updateGroupSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false)
    })
  })

  describe("description boundaries (when provided)", () => {
    it("accepts a 500-char description (max)", () => {
      expect(updateGroupSchema.safeParse({ description: "a".repeat(500) }).success).toBe(true)
    })

    it("rejects a 501-char description (over max)", () => {
      expect(updateGroupSchema.safeParse({ description: "a".repeat(501) }).success).toBe(false)
    })
  })
})
