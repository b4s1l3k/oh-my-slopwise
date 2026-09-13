import { describe, expect, it } from "vitest"
import {
  formatMoney,
  getInitials,
  parseMoneyInput,
  toCalendarDateInputValue,
} from "./format"

const noSpace = (value: string) => value.replace(/\s/g, "")

describe("money formatting and parsing boundary matrix", () => {
  it.each([
    ["0.001", 0],
    ["0.004", 0],
    ["0.005", 1],
    ["0.009", 1],
    ["1.004", 100],
    ["1.005", 100],
    ["1.006", 101],
    ["999.999", 100_000],
  ] as const)("rounds parsed decimal %s to %i kopecks", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected)
  })

  it.each(["Infinity", "+Infinity", "1e309"])("normalizes non-finite input %s to zero", (input) => {
    expect(parseMoneyInput(input)).toBe(0)
  })

  it.each([
    ["1e2", 10_000],
    ["12abc", 1_200],
    ["12,34.56", 1_234],
    ["  12.5  ", 1_250],
  ] as const)("pins parseFloat-compatible input %s as %i kopecks", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected)
  })

  it.each([
    [1, "0,01₽"],
    [10, "0,1₽"],
    [100, "1₽"],
    [2_000_000_000, "20000000₽"],
  ] as const)("formats %i RUB minor units exactly", (amount, expected) => {
    expect(noSpace(formatMoney(amount))).toBe(expected)
  })

  it("retains the application's two-decimal minor-unit convention for JPY", () => {
    expect(noSpace(formatMoney(123, "JPY"))).toBe("1,23¥")
  })
})

describe("calendar input and initials edge behavior", () => {
  it("uses the UTC day for an explicit Date supplied as an existing business date", () => {
    expect(toCalendarDateInputValue(new Date("2026-09-13T23:59:59.999Z"))).toBe("2026-09-13")
  })

  it("extracts only a leading date prefix from an API string", () => {
    expect(toCalendarDateInputValue("2026-09-13ignored-suffix")).toBe("2026-09-13")
  })

  it.each([
    [" Alice Bob ", "AB"],
    ["alice-bob", "A"],
    ["😀 Smile", "😀S"],
    ["éclair brûlée", "ÉB"],
  ] as const)("derives initials for %j as %j", (name, expected) => {
    expect(getInitials(name)).toBe(expected)
  })
})
