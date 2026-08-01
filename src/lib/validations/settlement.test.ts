import { describe, expect, it } from "vitest"
import { createSettlementSchema } from "./settlement"

const base = {
  groupId: "group",
  toUserId: "recipient",
  amount: 10_000,
  currency: "RUB",
  date: "2026-08-01T12:00:00.000Z",
}

describe("createSettlementSchema", () => {
  it("accepts an integer amount within the database range", () => {
    expect(createSettlementSchema.safeParse(base).success).toBe(true)
  })

  it("rejects an amount that cannot be stored safely", () => {
    expect(
      createSettlementSchema.safeParse({ ...base, amount: 2_147_483_648 }).success
    ).toBe(false)
  })
})
