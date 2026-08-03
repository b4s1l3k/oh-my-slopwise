import { describe, it, expect } from "vitest"
import { calculateSplits } from "./split-calculator"

// Спецификация деления суммы (в копейках) между участниками.
// Общие инварианты: сумма долей всегда равна исходной сумме; неделимый остаток
// целиком отдаётся ПЕРВОМУ участнику списка.
describe("calculateSplits", () => {
  describe("общие инварианты", () => {
    it("пустой список участников → пустой результат", () => {
      expect(calculateSplits(1000, "EQUAL", [])).toEqual([])
      expect(calculateSplits(1000, "EXACT", [])).toEqual([])
      expect(calculateSplits(1000, "PERCENTAGE", [])).toEqual([])
    })

    it("сохраняет порядок и состав участников", () => {
      const r = calculateSplits(300, "EQUAL", [{ userId: "x" }, { userId: "y" }, { userId: "z" }])
      expect(r.map((s) => s.userId)).toEqual(["x", "y", "z"])
    })
  })

  describe("EQUAL", () => {
    it("делит поровну без остатка", () => {
      const r = calculateSplits(300, "EQUAL", [{ userId: "a" }, { userId: "b" }, { userId: "c" }])
      expect(r).toEqual([
        { userId: "a", amount: 100 },
        { userId: "b", amount: 100 },
        { userId: "c", amount: 100 },
      ])
    })

    it("остаток отдаёт первому участнику", () => {
      const r = calculateSplits(100001, "EQUAL", [{ userId: "a" }, { userId: "b" }])
      expect(r).toEqual([
        { userId: "a", amount: 50001 },
        { userId: "b", amount: 50000 },
      ])
    })

    it("на троих с остатком 1 — первому +1, сумма сходится", () => {
      const r = calculateSplits(100000, "EQUAL", [{ userId: "a" }, { userId: "b" }, { userId: "c" }])
      expect(r[0].amount).toBe(33334)
      expect(r[1].amount).toBe(33333)
      expect(r[2].amount).toBe(33333)
      expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100000)
    })

    it("на сотне на троих: floor(100/3)=33, остаток 1 первому", () => {
      const r = calculateSplits(100, "EQUAL", [{ userId: "a" }, { userId: "b" }, { userId: "c" }])
      expect(r).toEqual([
        { userId: "a", amount: 34 },
        { userId: "b", amount: 33 },
        { userId: "c", amount: 33 },
      ])
    })

    it("один участник получает всю сумму", () => {
      expect(calculateSplits(777, "EQUAL", [{ userId: "solo" }])).toEqual([
        { userId: "solo", amount: 777 },
      ])
    })

    it("сумма 0 → все доли 0", () => {
      const r = calculateSplits(0, "EQUAL", [{ userId: "a" }, { userId: "b" }])
      expect(r).toEqual([
        { userId: "a", amount: 0 },
        { userId: "b", amount: 0 },
      ])
    })
  })

  describe("EXACT", () => {
    it("берёт указанные суммы как есть", () => {
      const r = calculateSplits(30000, "EXACT", [
        { userId: "a", amount: 10000 },
        { userId: "b", amount: 20000 },
      ])
      expect(r).toEqual([
        { userId: "a", amount: 10000 },
        { userId: "b", amount: 20000 },
      ])
    })

    it("не проверяет соответствие суммы (это делает Zod-валидация выше)", () => {
      // сам калькулятор доверяет входу — вернёт то, что дали
      const r = calculateSplits(999, "EXACT", [
        { userId: "a", amount: 1 },
        { userId: "b", amount: 2 },
      ])
      expect(r).toEqual([
        { userId: "a", amount: 1 },
        { userId: "b", amount: 2 },
      ])
    })
  })

  describe("PERCENTAGE", () => {
    it("проценты хранятся ×100: 30% + 70%", () => {
      const r = calculateSplits(100000, "PERCENTAGE", [
        { userId: "a", percentage: 3000 },
        { userId: "b", percentage: 7000 },
      ])
      expect(r).toEqual([
        { userId: "a", amount: 30000 },
        { userId: "b", amount: 70000 },
      ])
    })

    it("остаток округления отдаётся первому, сумма сходится", () => {
      const r = calculateSplits(100001, "PERCENTAGE", [
        { userId: "a", percentage: 3333 },
        { userId: "b", percentage: 3333 },
        { userId: "c", percentage: 3334 },
      ])
      expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100001)
      // floor(100001*0.3333)=33330, floor(100001*0.3334)=33340; сумма floor=100000, остаток 1 -> первому
      expect(r[0].amount).toBe(33331)
      expect(r[1].amount).toBe(33330)
      expect(r[2].amount).toBe(33340)
    })

    it("100% одному участнику", () => {
      expect(
        calculateSplits(5000, "PERCENTAGE", [{ userId: "a", percentage: 10000 }])
      ).toEqual([{ userId: "a", amount: 5000 }])
    })
  })
})
