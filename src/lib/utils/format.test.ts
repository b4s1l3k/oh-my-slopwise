import { describe, expect, it } from "vitest"
import { parseMoneyInput, toLocalDateInputValue } from "./format"

describe("format helpers", () => {
  it("formats a local calendar date without shifting it through UTC", () => {
    expect(toLocalDateInputValue(new Date(2026, 7, 1, 0, 30))).toBe("2026-08-01")
  })

  it("rounds money input to the smallest currency unit", () => {
    expect(parseMoneyInput("12,34")).toBe(1234)
  })
})
