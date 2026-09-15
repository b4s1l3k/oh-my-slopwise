import { describe, expect, it } from "vitest"
import { decodeInstantCursor, encodeInstantCursor } from "@/lib/instant-cursor"

describe("instant cursor", () => {
  it("round-trips the complete deterministic order tuple", () => {
    const source = {
      updatedAt: new Date("2028-07-20T10:11:12.123Z"),
      id: "record/id:1",
    }

    expect(decodeInstantCursor(encodeInstantCursor(source))).toEqual(source)
  })

  it.each([
    "",
    "not-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(["not-an-instant", "id"])).toString("base64url"),
    Buffer.from(JSON.stringify(["2028-01-01T00:00:00.000Z", ""])).toString("base64url"),
    "x".repeat(2_049),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(() => decodeInstantCursor(cursor)).toThrow("INVALID_CURSOR")
  })
})
