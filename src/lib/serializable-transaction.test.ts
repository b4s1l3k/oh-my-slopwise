import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}))

import { runSerializableTransaction } from "./serializable-transaction"

function serializationConflict() {
  return new Prisma.PrismaClientKnownRequestError("write conflict", {
    code: "P2034",
    clientVersion: "test",
  })
}

describe("runSerializableTransaction", () => {
  beforeEach(() => {
    mocks.transaction.mockReset()
  })

  it("retries P2034 and returns the successful attempt", async () => {
    mocks.transaction
      .mockRejectedValueOnce(serializationConflict())
      .mockRejectedValueOnce(serializationConflict())
      .mockResolvedValueOnce("committed")

    await expect(runSerializableTransaction(async () => "unused")).resolves.toBe("committed")
    expect(mocks.transaction).toHaveBeenCalledTimes(3)
    expect(mocks.transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it("does not retry an unrelated failure", async () => {
    const failure = new Error("BROKEN")
    mocks.transaction.mockRejectedValueOnce(failure)

    await expect(runSerializableTransaction(async () => "unused")).rejects.toBe(failure)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it("turns an exhausted conflict into a stable domain error", async () => {
    mocks.transaction.mockRejectedValue(serializationConflict())

    await expect(runSerializableTransaction(async () => "unused")).rejects.toThrow(
      "TRANSACTION_CONFLICT"
    )
    expect(mocks.transaction).toHaveBeenCalledTimes(3)
  })
})
