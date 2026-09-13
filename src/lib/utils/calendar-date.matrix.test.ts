import { describe, expect, it } from "vitest"
import { isValidCalendarDate, parseCalendarDate } from "./calendar-date"

const validDates = [
  "0000-01-01",
  "0099-12-31",
  "1900-02-28",
  "2000-02-29",
  "2024-02-29",
  "2026-01-01",
  "2026-04-30",
  "2026-12-31",
  "9999-12-31",
]

const invalidDates = [
  "",
  " ",
  "2026-00-01",
  "2026-13-01",
  "2026-01-00",
  "2026-01-32",
  "2026-02-29",
  "1900-02-29",
  "2100-02-29",
  "2026-04-31",
  "2026-06-31",
  "2026-09-31",
  "2026-11-31",
  "26-01-01",
  "2026-1-01",
  "2026-01-1",
  "+2026-01-01",
  "2026/01/01",
  "01-01-2026",
  "2026-01-01 ",
  " 2026-01-01",
  "2026-01-01\n",
  "２０２６-０１-０１",
]

describe("calendar date compatibility matrix", () => {
  it.each(validDates)("accepts and round-trips %s at UTC midnight", (value) => {
    const parsed = parseCalendarDate(value)

    expect(isValidCalendarDate(value)).toBe(true)
    expect(parsed.getUTCHours()).toBe(0)
    expect(parsed.getUTCMinutes()).toBe(0)
    expect(parsed.getUTCSeconds()).toBe(0)
    expect(parsed.getUTCMilliseconds()).toBe(0)
    expect(parsed.toISOString().slice(0, 10)).toBe(value)
  })

  it.each(invalidDates)("rejects malformed or impossible value %j", (value) => {
    expect(isValidCalendarDate(value)).toBe(false)
    expect(() => parseCalendarDate(value)).toThrowError(new Error("INVALID_CALENDAR_DATE"))
  })

  it.each([
    ["2000-02-29", true],
    ["2004-02-29", true],
    ["2100-02-29", false],
    ["2400-02-29", true],
  ] as const)("applies Gregorian century leap-year rules to %s", (value, expected) => {
    expect(isValidCalendarDate(value)).toBe(expected)
  })

  it.each([
    ["2026-01-31", true],
    ["2026-02-28", true],
    ["2026-03-31", true],
    ["2026-04-30", true],
    ["2026-05-31", true],
    ["2026-06-30", true],
    ["2026-07-31", true],
    ["2026-08-31", true],
    ["2026-09-30", true],
    ["2026-10-31", true],
    ["2026-11-30", true],
    ["2026-12-31", true],
  ] as const)("recognizes the last day of month %s", (value, expected) => {
    expect(isValidCalendarDate(value)).toBe(expected)
  })
})
