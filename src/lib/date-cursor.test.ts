import { describe, expect, it } from "vitest"
import { decodeDateCursor, encodeDateCursor } from "@/lib/date-cursor"

describe("date cursor", () => {
  it("round-trips the complete deterministic order tuple", () => {
    const source = {
      date: new Date("2028-07-19T00:00:00.000Z"),
      createdAt: new Date("2028-07-20T10:11:12.123Z"),
      id: "record/id:1",
    }

    expect(decodeDateCursor(encodeDateCursor(source))).toEqual(source)
  })

  it.each([
    "",
    "not-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(["2028-02-30", "2028-01-01T00:00:00.000Z", "id"]))
      .toString("base64url"),
    Buffer.from(JSON.stringify(["2028-01-01", "not-an-instant", "id"]))
      .toString("base64url"),
    Buffer.from(JSON.stringify(["2028-01-01", "2028-01-01T00:00:00.000Z", ""]))
      .toString("base64url"),
    "x".repeat(2_049),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(() => decodeDateCursor(cursor)).toThrow("INVALID_CURSOR")
  })
})
