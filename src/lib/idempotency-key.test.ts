import { describe, expect, it } from "vitest"
import { readIdempotencyKey } from "@/lib/idempotency-key"

describe("readIdempotencyKey", () => {
  it("accepts a valid key and treats a missing header as legacy mode", () => {
    expect(readIdempotencyKey(new Request("https://example.test"))).toBeUndefined()
    expect(readIdempotencyKey(new Request("https://example.test", {
      headers: { "Idempotency-Key": "command_01:test" },
    }))).toBe("command_01:test")
  })

  it.each(["short", "contains spaces", "invalidé1"])(
    "rejects invalid key %s",
    (key) => {
      expect(() => readIdempotencyKey(new Request("https://example.test", {
        headers: { "Idempotency-Key": key },
      }))).toThrow("INVALID_IDEMPOTENCY_KEY")
    }
  )
})
