import { describe, expect, it } from "vitest"
import { isValidCalendarDate, parseCalendarDate } from "./calendar-date"

describe("parseCalendarDate", () => {
  it("stores a date-only value as UTC midnight", () => {
    expect(parseCalendarDate("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })

  it("rejects timestamps instead of silently discarding their time and offset", () => {
    expect(isValidCalendarDate("2026-08-01T23:30:00-07:00")).toBe(false)
    expect(() => parseCalendarDate("2026-08-01T23:30:00-07:00")).toThrow(
      "INVALID_CALENDAR_DATE"
    )
  })

  it("rejects normalized and non-ISO dates", () => {
    expect(isValidCalendarDate("2026-02-31")).toBe(false)
    expect(isValidCalendarDate("August 1, 2026")).toBe(false)
  })
})
