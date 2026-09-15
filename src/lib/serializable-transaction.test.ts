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

function deferredSerializationConflict() {
  return new Prisma.PrismaClientKnownRequestError("raw transaction conflict", {
    code: "P2010",
    clientVersion: "test",
    meta: {
      code: "40001",
      message: "could not serialize access due to read/write dependencies among transactions",
    },
  })
}

function postgresDeadlock() {
  return new Prisma.PrismaClientUnknownRequestError(
    'PostgresError { code: "40P01", message: "deadlock detected" }',
    { clientVersion: "test" }
  )
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

  it("retries a deferred PostgreSQL 40001 surfaced by Prisma as P2010", async () => {
    mocks.transaction
      .mockRejectedValueOnce(deferredSerializationConflict())
      .mockResolvedValueOnce("committed")

    await expect(runSerializableTransaction(async () => "unused")).resolves.toBe("committed")
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })

  it("retries a PostgreSQL 40P01 surfaced as an unknown Prisma request error", async () => {
    mocks.transaction
      .mockRejectedValueOnce(postgresDeadlock())
      .mockResolvedValueOnce("committed")

    await expect(runSerializableTransaction(async () => "unused")).resolves.toBe("committed")
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })

  it("does not retry an unrelated failure", async () => {
    const failure = new Error("BROKEN")
    mocks.transaction.mockRejectedValueOnce(failure)

    await expect(runSerializableTransaction(async () => "unused")).rejects.toBe(failure)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it("does not retry an unrelated raw-query P2010", async () => {
    const failure = new Prisma.PrismaClientKnownRequestError("raw constraint failure", {
      code: "P2010",
      clientVersion: "test",
      meta: { code: "23514" },
    })
    mocks.transaction.mockRejectedValueOnce(failure)

    await expect(runSerializableTransaction(async () => "unused")).rejects.toBe(failure)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it("does not retry an unknown Prisma request error without PostgreSQL deadlock SQLSTATE", async () => {
    const failure = new Prisma.PrismaClientUnknownRequestError(
      'PostgresError { code: "23514", message: "constraint failed" }',
      { clientVersion: "test" }
    )
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
