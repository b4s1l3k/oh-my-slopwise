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

describe("calculateSimplifiedDebts — переадресация и инварианты", () => {
  it("можно оказаться должен тому, кто за тебя не платил (переадресация)", () => {
    // bob заплатил за alice (alice должна bob 100); alice заплатила за carol (carol должна alice 100).
    // нетто: bob +100, alice 0, carol -100 → carol платит bob напрямую.
    const { simplified } = calculateSimplifiedDebts(
      [
        { paidById: "bob", splits: [{ userId: "alice", amount: 100000 }, { userId: "bob", amount: 100000 }] },
        { paidById: "alice", splits: [{ userId: "alice", amount: 100000 }, { userId: "carol", amount: 100000 }] },
      ],
      [],
      names
    )
    expect(simplified).toEqual([
      { fromUserId: "carol", fromUserName: "Карина", toUserId: "bob", toUserName: "Боб", amount: 100000 },
    ])
  })

  it("доля самого плательщика не создаёт долг перед собой", () => {
    const { raw, simplified } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 100000 }] }],
      [],
      names
    )
    expect(raw.find((b) => b.userId === "alice")!.balance).toBe(0)
    expect(simplified).toEqual([])
  })

  it("нетто-баланс каждого участника считается точно (расходы + расчёт)", () => {
    // Расход 1: alice заплатила, доли alice/bob/carol = 30000/30000/40000
    //   → alice +70000, bob -30000, carol -40000.
    // Расход 2: bob заплатил, доли alice/bob/carol = 20000/20000/30000
    //   → alice -20000, bob +50000, carol -30000.
    // Итог по расходам: alice +50000, bob +20000, carol -70000.
    // Расчёт: carol вернула alice 10000 → alice -10000, carol +10000.
    // Финал: alice +40000, bob +20000, carol -60000 (сумма = 0).
    const { raw } = calculateSimplifiedDebts(
      [
        { paidById: "alice", splits: [{ userId: "alice", amount: 30000 }, { userId: "bob", amount: 30000 }, { userId: "carol", amount: 40000 }] },
        { paidById: "bob", splits: [{ userId: "alice", amount: 20000 }, { userId: "bob", amount: 20000 }, { userId: "carol", amount: 30000 }] },
      ],
      [{ fromUserId: "carol", toUserId: "alice", amount: 10000 }],
      names
    )
    const balance = (id: string) => raw.find((b) => b.userId === id)!.balance
    expect(balance("alice")).toBe(40000)
    expect(balance("bob")).toBe(20000)
    expect(balance("carol")).toBe(-60000)
    // и, как следствие, сумма нетто равна нулю
    expect(raw.reduce((s, b) => s + b.balance, 0)).toBe(0)
  })

  it("один крупный должник закрывает нескольких кредиторов (ветка ci++)", () => {
    // alice +100000, bob +100000, carol -200000 → жадный алгоритм гасит
    // первого кредитора (ci++), оставаясь на том же должнике, затем второго.
    const { simplified } = calculateSimplifiedDebts(
      [
        { paidById: "alice", splits: [{ userId: "alice", amount: 100000 }, { userId: "carol", amount: 100000 }] },
        { paidById: "bob", splits: [{ userId: "bob", amount: 100000 }, { userId: "carol", amount: 100000 }] },
      ],
      [],
      names
    )
    // ровно два перевода, оба от carol, по 100000 — к alice и к bob
    expect(simplified).toHaveLength(2)
    expect(simplified.every((d) => d.fromUserId === "carol" && d.amount === 100000)).toBe(true)
    expect(simplified.map((d) => d.toUserId).sort()).toEqual(["alice", "bob"])
  })

  it("имя берётся из userId, если его нет в справочнике имён", () => {
    const { simplified } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 100000 }, { userId: "zzz", amount: 100000 }] }],
      [],
      { alice: "Алиса" } // для zzz имени нет
    )
    expect(simplified[0].fromUserId).toBe("zzz")
    expect(simplified[0].fromUserName).toBe("zzz")
  })

  it("имя кредитора тоже подставляется из userId при отсутствии в справочнике", () => {
    // Плательщик (кредитор) без имени в справочнике → toUserName === userId.
    const { simplified } = calculateSimplifiedDebts(
      [{ paidById: "zzz", splits: [{ userId: "zzz", amount: 100000 }, { userId: "bob", amount: 100000 }] }],
      [],
      { bob: "Боб" } // для zzz имени нет
    )
    expect(simplified[0].toUserId).toBe("zzz")
    expect(simplified[0].toUserName).toBe("zzz")
  })

  it("ручной расчёт (settlement) уменьшает долг так же, как наличные", () => {
    const { simplified } = calculateSimplifiedDebts(
      [{ paidById: "alice", splits: [{ userId: "alice", amount: 100000 }, { userId: "bob", amount: 100000 }] }],
      [{ fromUserId: "bob", toUserId: "alice", amount: 60000 }],
      names
    )
    expect(simplified).toEqual([
      { fromUserId: "bob", fromUserName: "Боб", toUserId: "alice", toUserName: "Алиса", amount: 40000 },
    ])
  })
})
