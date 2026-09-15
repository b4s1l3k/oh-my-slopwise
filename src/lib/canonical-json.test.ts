import { describe, expect, it } from "vitest"
import { canonicalJson } from "@/lib/canonical-json"
import { hashIdempotencyRequest } from "@/lib/idempotent-command"

describe("canonicalJson", () => {
  it("produces the same representation regardless of object property order", () => {
    const left = { title: "Dinner", splits: [{ amount: 500, userId: "u-1" }], amount: 500 }
    const right = { amount: 500, splits: [{ userId: "u-1", amount: 500 }], title: "Dinner" }

    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(hashIdempotencyRequest(left)).toBe(hashIdempotencyRequest(right))
  })

  it("keeps array order and material payload changes significant", () => {
    expect(hashIdempotencyRequest({ members: ["u-1", "u-2"] }))
      .not.toBe(hashIdempotencyRequest({ members: ["u-2", "u-1"] }))
    expect(hashIdempotencyRequest({ amount: 500 }))
      .not.toBe(hashIdempotencyRequest({ amount: 501 }))
  })

  it("matches JSON semantics for undefined object properties and array items", () => {
    expect(canonicalJson({ amount: 500, note: undefined })).toBe('{"amount":500}')
    expect(canonicalJson([1, undefined, 3])).toBe("[1,null,3]")
  })
})
