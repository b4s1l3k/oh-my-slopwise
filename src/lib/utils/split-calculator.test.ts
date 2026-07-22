import { describe, it, expect } from "vitest"
import { calculateSplits } from "./split-calculator"

describe("calculateSplits", () => {
  it("EQUAL делит поровну и отдаёт остаток первому", () => {
    const r = calculateSplits(100001, "EQUAL", [{ userId: "a" }, { userId: "b" }])
    expect(r).toEqual([
      { userId: "a", amount: 50001 },
      { userId: "b", amount: 50000 },
    ])
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100001)
  })

  it("EQUAL на троих с неделимым остатком — сумма сходится", () => {
    const r = calculateSplits(100000, "EQUAL", [{ userId: "a" }, { userId: "b" }, { userId: "c" }])
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100000)
    expect(r[0].amount).toBe(33334) // 33333 + остаток 1
    expect(r[1].amount).toBe(33333)
  })

  it("EXACT берёт суммы как есть", () => {
    const r = calculateSplits(30000, "EXACT", [
      { userId: "a", amount: 10000 },
      { userId: "b", amount: 20000 },
    ])
    expect(r).toEqual([
      { userId: "a", amount: 10000 },
      { userId: "b", amount: 20000 },
    ])
  })

  it("PERCENTAGE считает по процентам (×100) и сходится по сумме", () => {
    const r = calculateSplits(100000, "PERCENTAGE", [
      { userId: "a", percentage: 3000 }, // 30%
      { userId: "b", percentage: 7000 }, // 70%
    ])
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100000)
    expect(r.find((x) => x.userId === "b")!.amount).toBe(70000)
  })

  it("пустой список участников → пусто", () => {
    expect(calculateSplits(1000, "EQUAL", [])).toEqual([])
  })
})
