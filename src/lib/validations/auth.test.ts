import { describe, expect, it } from "vitest"
import {
  isPasswordWithinBcryptLimit,
  registrationSchema,
} from "./auth"

describe("bcrypt password byte limit", () => {
  it("accepts at most 72 ASCII bytes and rejects a longer password", () => {
    expect(isPasswordWithinBcryptLimit("a".repeat(72))).toBe(true)
    expect(isPasswordWithinBcryptLimit("a".repeat(73))).toBe(false)
  })

  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    expect(isPasswordWithinBcryptLimit("я".repeat(36))).toBe(true)
    expect(isPasswordWithinBcryptLimit("я".repeat(37))).toBe(false)
  })

  it("applies the byte limit to registration", () => {
    const base = { email: "user@example.com", name: "User" }
    expect(registrationSchema.safeParse({ ...base, password: "a".repeat(72) }).success).toBe(true)
    expect(registrationSchema.safeParse({ ...base, password: "я".repeat(37) }).success).toBe(false)
  })
})
