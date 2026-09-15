import { describe, expect, it } from "vitest"
import { decodeActivityCursor, encodeActivityCursor } from "@/lib/activity-cursor"

describe("activity cursor", () => {
  it("round-trips the stable activity sort key", () => {
    const cursor = encodeActivityCursor({
      createdAt: new Date("2026-09-15T10:11:12.123Z"),
      id: "activity-42",
    })

    expect(decodeActivityCursor(cursor)).toEqual({
      createdAt: new Date("2026-09-15T10:11:12.123Z"),
      id: "activity-42",
    })
    expect(cursor).not.toContain("2026-09-15")
  })

  it.each([
    "",
    "not-base64!",
    Buffer.from("null").toString("base64url"),
    Buffer.from(JSON.stringify([])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-15T10:00:00.000Z"])).toString("base64url"),
    Buffer.from(JSON.stringify(["invalid", "activity-1"])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-15T10:00:00Z", "activity-1"])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-15T10:00:00.000Z", ""])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-15T10:00:00.000Z", 1])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-15T10:00:00.000Z", "activity-1", "extra"])).toString("base64url"),
    "a".repeat(2_049),
  ])("rejects malformed cursor %#", (cursor) => {
    expect(() => decodeActivityCursor(cursor)).toThrow("INVALID_CURSOR")
  })

  it("rejects a non-canonical base64url representation", () => {
    const cursor = encodeActivityCursor({
      createdAt: new Date("2026-09-15T10:11:12.123Z"),
      id: "activity-42",
    })

    expect(() => decodeActivityCursor(`${cursor}=`)).toThrow("INVALID_CURSOR")
  })
})
