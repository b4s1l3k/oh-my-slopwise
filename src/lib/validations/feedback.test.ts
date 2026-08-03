import { describe, it, expect } from "vitest"
import { feedbackSchema } from "@/lib/validations/feedback"

describe("feedbackSchema", () => {
  describe("valid inputs", () => {
    it("accepts a message at the minimum length (10 chars)", () => {
      const result = feedbackSchema.safeParse({ message: "a".repeat(10) })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ message: "a".repeat(10) })
      }
    })

    it("accepts a message at the maximum length (2000 chars)", () => {
      const result = feedbackSchema.safeParse({ message: "a".repeat(2000) })
      expect(result.success).toBe(true)
    })

    it("accepts a typical message", () => {
      const result = feedbackSchema.safeParse({ message: "This app is great, please add dark mode." })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.message).toBe("This app is great, please add dark mode.")
      }
    })
  })

  describe("required field: message", () => {
    it("rejects when message is missing", () => {
      const result = feedbackSchema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["message"])
        expect(result.error.issues[0].code).toBe("invalid_type")
      }
    })

    it("rejects a non-string message", () => {
      expect(feedbackSchema.safeParse({ message: 12345 }).success).toBe(false)
    })
  })

  describe("length boundaries", () => {
    it("rejects a 9-char message (below min) with the custom message", () => {
      const result = feedbackSchema.safeParse({ message: "a".repeat(9) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Минимум 10 символов")
      }
    })

    it("rejects an empty message (below min)", () => {
      const result = feedbackSchema.safeParse({ message: "" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Минимум 10 символов")
      }
    })

    it("rejects a 2001-char message (above max) with the custom message", () => {
      const result = feedbackSchema.safeParse({ message: "a".repeat(2001) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Максимум 2000 символов")
      }
    })
  })
})
