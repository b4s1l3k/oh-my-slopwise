import { describe, expect, it } from "vitest"
import { isValidCalendarDate, parseCalendarDate } from "./calendar-date"

describe("parseCalendarDate", () => {
  it("stores a date-only value as UTC midnight", () => {
    expect(parseCalendarDate("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })

  it("keeps the literal business day from a legacy timestamp with an offset", () => {
    expect(parseCalendarDate("2026-08-01T23:30:00-07:00").toISOString()).toBe(
      "2026-08-01T00:00:00.000Z"
    )
  })

  it("rejects normalized and non-ISO dates", () => {
    expect(isValidCalendarDate("2026-02-31")).toBe(false)
    expect(isValidCalendarDate("August 1, 2026")).toBe(false)
  })
})
