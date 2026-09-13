import { describe, expect, it } from "vitest"
import { isCoffeeExpense } from "./achievements"

describe("coffee achievement lexical boundary matrix", () => {
  it.each([
    "COFFEE",
    "coffee!",
    "(coffee)",
    "кофейный напиток",
    "в кофейне",
    "КАПУЧИНО",
    "латте-макиато",
    "espresso/americano",
    "раф_сироп",
  ])("matches case-insensitively at non-letter boundaries: %s", (value) => {
    expect(isCoffeeExpense(value)).toBe(true)
  })

  it.each([
    "coffeeshop",
    "mycoffee",
    "кофеварка",
    "кофеёк",
    "латтеральный",
    "рафик",
    "американоид",
    "decaffeinated",
  ])("does not match a marker embedded in a larger letter sequence: %s", (value) => {
    expect(isCoffeeExpense(value)).toBe(false)
  })

  it("combines title and category while retaining a lexical boundary between them", () => {
    expect(isCoffeeExpense("Dinner", "espresso")).toBe(true)
    expect(isCoffeeExpense("my", "coffee")).toBe(true)
    expect(isCoffeeExpense("mycoffee", "restaurant")).toBe(false)
  })
})
