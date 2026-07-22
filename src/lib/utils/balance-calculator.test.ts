import { describe, it, expect } from "vitest"
import { calculateSimplifiedDebts } from "./balance-calculator"

const names = { alice: "Алиса", bob: "Боб", carol: "Карина" }

describe("calculateSimplifiedDebts", () => {
  it("простой равный расход: должник должен плательщику половину", () => {
    const { simplified, raw } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 120000 }, { userId: "bob", amount: 120000 }] }],
      [],
      names
    )
    expect(raw.find((b) => b.userId === "alice")!.balance).toBe(120000)
    expect(raw.find((b) => b.userId === "bob")!.balance).toBe(-120000)
    expect(simplified).toEqual([
      { fromUserId: "bob", fromUserName: "Боб", toUserId: "alice", toUserName: "Алиса", amount: 120000 },
    ])
  })

  it("сценарий пользователя: 2400 поровну, друг вернул 400 наличными → должен 800", () => {
    // Расход 2400 (в копейках 240000), поровну по 1200. Расчёт наличными bob→alice 400.
    const { simplified } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 120000 }, { userId: "bob", amount: 120000 }] }],
      [{ fromUserId: "bob", toUserId: "alice", amount: 40000 }],
      names
    )
    expect(simplified).toEqual([
      { fromUserId: "bob", fromUserName: "Боб", toUserId: "alice", toUserName: "Алиса", amount: 80000 },
    ])
  })

  it("наличные погасили долг полностью → нет расчётов", () => {
    const { simplified, raw } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 120000 }, { userId: "bob", amount: 120000 }] }],
      [{ fromUserId: "bob", toUserId: "alice", amount: 120000 }],
      names
    )
    expect(raw.every((b) => b.balance === 0)).toBe(true)
    expect(simplified).toEqual([])
  })

  it("наличные больше доли → долг разворачивается (плательщик должен сдачу)", () => {
    // bob отдал 1500 наличными, а доля была 1200 → alice должна bob 300
    const { simplified } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 120000 }, { userId: "bob", amount: 120000 }] }],
      [{ fromUserId: "bob", toUserId: "alice", amount: 150000 }],
      names
    )
    expect(simplified).toEqual([
      { fromUserId: "alice", fromUserName: "Алиса", toUserId: "bob", toUserName: "Боб", amount: 30000 },
    ])
  })

  it("три участника: минимизирует число переводов", () => {
    // alice платит 3000 за троих (по 1000). bob и carol должны alice по 1000.
    const { simplified } = calculateSimplifiedDebts(
      [
        {
          paidById: "alice",
          splits: [
            { userId: "alice", amount: 100000 },
            { userId: "bob", amount: 100000 },
            { userId: "carol", amount: 100000 },
          ],
        },
      ],
      [],
      names
    )
    // ровно 2 перевода (n-1), оба к alice
    expect(simplified).toHaveLength(2)
    expect(simplified.every((d) => d.toUserId === "alice" && d.amount === 100000)).toBe(true)
  })

  it("взаимные долги схлопываются в один перевод", () => {
    // alice платит 1000 за двоих (bob должен 500); bob платит 2000 за двоих (alice должна 1000)
    // нетто: alice должна bob 500
    const { simplified } = calculateSimplifiedDebts(
      [
        { paidById: "alice", splits: [{ userId: "alice", amount: 50000 }, { userId: "bob", amount: 50000 }] },
        { paidById: "bob", splits: [{ userId: "alice", amount: 100000 }, { userId: "bob", amount: 100000 }] },
      ],
      [],
      names
    )
    expect(simplified).toEqual([
      { fromUserId: "alice", fromUserName: "Алиса", toUserId: "bob", toUserName: "Боб", amount: 50000 },
    ])
  })

  it("пустой ввод → пустой результат", () => {
    expect(calculateSimplifiedDebts([], [], names).simplified).toEqual([])
  })
})
