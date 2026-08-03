import { describe, it, expect } from "vitest"
import { updateProfileSchema, requisitesSchema } from "@/lib/validations/user"

describe("requisitesSchema", () => {
  describe("valid inputs and optionalText transform", () => {
    it("accepts an empty object (all fields optional) → empty object", () => {
      const result = requisitesSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        // undefined optional fields are absent from output
        expect(result.data).toEqual({})
      }
    })

    it("trims surrounding whitespace on a non-empty value", () => {
      const result = requisitesSchema.safeParse({ payeeName: "  Ivan Petrov  " })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ payeeName: "Ivan Petrov" })
      }
    })

    it('turns an empty string "" into null', () => {
      const result = requisitesSchema.safeParse({ payeeName: "" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ payeeName: null })
      }
    })

    it("turns a whitespace-only string into null", () => {
      const result = requisitesSchema.safeParse({ bankName: "   " })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ bankName: null })
      }
    })

    it("passes an explicit null through unchanged (clearing a field)", () => {
      const result = requisitesSchema.safeParse({ payeeAccount: null })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ payeeAccount: null })
      }
    })

    it("accepts a full valid object and trims each field", () => {
      const result = requisitesSchema.safeParse({
        payeeName: " Alice ",
        bankName: " Tinkoff ",
        payeeAccount: " 40817 ",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          payeeName: "Alice",
          bankName: "Tinkoff",
          payeeAccount: "40817",
        })
      }
    })
  })

  describe("length boundaries (validated on the raw, pre-trim string)", () => {
    it("accepts payeeName at 200 chars (max)", () => {
      expect(requisitesSchema.safeParse({ payeeName: "a".repeat(200) }).success).toBe(true)
    })

    it("rejects payeeName at 201 chars (over max)", () => {
      expect(requisitesSchema.safeParse({ payeeName: "a".repeat(201) }).success).toBe(false)
    })

    it("accepts bankName at 100 chars (max)", () => {
      expect(requisitesSchema.safeParse({ bankName: "a".repeat(100) }).success).toBe(true)
    })

    it("rejects bankName at 101 chars (over max)", () => {
      expect(requisitesSchema.safeParse({ bankName: "a".repeat(101) }).success).toBe(false)
    })

    it("accepts payeeAccount at 100 chars (max)", () => {
      expect(requisitesSchema.safeParse({ payeeAccount: "a".repeat(100) }).success).toBe(true)
    })

    it("rejects payeeAccount at 101 chars (over max)", () => {
      expect(requisitesSchema.safeParse({ payeeAccount: "a".repeat(101) }).success).toBe(false)
    })

    it("rejects a non-string value", () => {
      expect(requisitesSchema.safeParse({ payeeName: 123 }).success).toBe(false)
    })

    it("длина проверяется ДО обрезки пробелов (raw, не trimmed)", () => {
      // 199 значимых символов + 2 пробела = 201 в сыром виде. .max(200) стоит
      // ПЕРЕД .transform(trim), поэтому строка отклоняется, хотя после trim было
      // бы 199. Это отличает «проверить сырое, потом обрезать» от «обрезать, потом
      // проверить» — важно воспроизвести при переписывании.
      const raw201 = "a".repeat(199) + "  "
      expect(requisitesSchema.safeParse({ payeeName: raw201 }).success).toBe(false)
      // а ровно 200 значимых символов без пробелов проходят
      expect(requisitesSchema.safeParse({ payeeName: "a".repeat(200) }).success).toBe(true)
    })
  })
})

describe("updateProfileSchema", () => {
  describe("valid inputs", () => {
    it("accepts an empty object (all fields optional) → empty object", () => {
      const result = updateProfileSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({})
      }
    })

    it("accepts a full valid object (name + avatarUrl + requisites), trimming requisites", () => {
      const result = updateProfileSchema.safeParse({
        name: "Bob",
        avatarUrl: "https://example.com/avatar.png",
        payeeName: " Bob ",
        bankName: " Sber ",
        payeeAccount: " 123 ",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          name: "Bob",
          avatarUrl: "https://example.com/avatar.png",
          payeeName: "Bob",
          bankName: "Sber",
          payeeAccount: "123",
        })
      }
    })

    it("merges the requisites fields into the profile schema", () => {
      const result = updateProfileSchema.safeParse({ payeeName: "" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ payeeName: null })
      }
    })
  })

  describe("name field", () => {
    it("accepts a 1-char name (min)", () => {
      expect(updateProfileSchema.safeParse({ name: "a" }).success).toBe(true)
    })

    it("accepts a 100-char name (max)", () => {
      expect(updateProfileSchema.safeParse({ name: "a".repeat(100) }).success).toBe(true)
    })

    it("rejects an empty name with the custom message", () => {
      const result = updateProfileSchema.safeParse({ name: "" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["name"])
        expect(result.error.issues[0].message).toBe("Имя обязательно")
      }
    })

    it("rejects a 101-char name (over max)", () => {
      expect(updateProfileSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false)
    })
  })

  describe("avatarUrl refine (http(s) only)", () => {
    it("accepts an https URL", () => {
      const result = updateProfileSchema.safeParse({ avatarUrl: "https://cdn.site/a.png" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.avatarUrl).toBe("https://cdn.site/a.png")
      }
    })

    it("accepts an http URL", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "http://site/a.png" }).success).toBe(true)
    })

    it("accepts uppercase HTTPS scheme (case-insensitive refine)", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "HTTPS://site/a.png" }).success).toBe(true)
    })

    it("accepts null to clear the avatar", () => {
      const result = updateProfileSchema.safeParse({ avatarUrl: null })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.avatarUrl).toBeNull()
      }
    })

    it("accepts undefined / omitted avatarUrl", () => {
      const result = updateProfileSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.avatarUrl).toBeUndefined()
      }
    })

    it("rejects a javascript: URL with the custom message", () => {
      const result = updateProfileSchema.safeParse({ avatarUrl: "javascript:alert(1)" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["avatarUrl"])
        expect(result.error.issues[0].message).toBe(
          "Ссылка должна начинаться с http:// или https://",
        )
      }
    })

    it("rejects a data: URL", () => {
      expect(
        updateProfileSchema.safeParse({ avatarUrl: "data:text/html,<script>1</script>" }).success,
      ).toBe(false)
    })

    it("rejects an ftp: URL", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "ftp://host/a.png" }).success).toBe(false)
    })

    it("rejects a relative URL (fails .url())", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "/images/a.png" }).success).toBe(false)
    })

    it("rejects a non-URL plain string (fails .url())", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "not a url" }).success).toBe(false)
    })

    it("rejects an empty string (fails .url())", () => {
      expect(updateProfileSchema.safeParse({ avatarUrl: "" }).success).toBe(false)
    })
  })
})
