import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { runSerializableTransaction } from "@/lib/serializable-transaction"
import { createExpense } from "@/services/expenses.service"
import { addMember, createGroup, updateGroup } from "@/services/groups.service"
import { acceptInvite, getOrCreateInvite } from "@/services/invites.service"
import { createSettlement } from "@/services/settlements.service"
import { getHistoricalUserStatistics } from "@/services/statistics.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `persistence-concurrency-${Date.now()}`
const operationDate = "2028-01-15"

let userSequence = 0

function createBarrier(participants: number): () => Promise<void> {
  let arrivals = 0
  let release = () => {}
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })

  return async () => {
    arrivals += 1
    if (arrivals === participants) release()
    await ready
  }
}

async function createUser(name: string) {
  userSequence += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-${userSequence}@example.test`,
      name,
      passwordHash: "test-only",
    },
  })
}

async function createDebtGroup(debtor: { id: string }, creditor: { id: string }, amount: number) {
  const group = await createGroup(debtor.id, {
    name: "Concurrent debt",
    type: "OTHER",
    currency: "RUB",
    memberIds: [creditor.id],
  })
  await createExpense(group.id, debtor.id, {
    title: "Concurrent settlement source",
    amount,
    currency: "RUB",
    date: operationDate,
    paidById: creditor.id,
    splitType: "EXACT",
    splits: [{ userId: debtor.id, amount }],
  })
  return group
}

describeDatabase("persistence concurrency and idempotency", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("retries a real overlapping serializable conflict without losing either update", async () => {
    const user = await createUser("Serializable barrier")
    const waitForBothReads = createBarrier(2)
    const attempts = [0, 0]

    const appendMarker = (operationIndex: number) =>
      runSerializableTransaction(async (tx) => {
        attempts[operationIndex] += 1
        const snapshot = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { name: true },
        })
        if (attempts[operationIndex] === 1) {
          await waitForBothReads()
        }
        return tx.user.update({
          where: { id: user.id },
          data: { name: `${snapshot.name}!` },
          select: { name: true },
        })
      })

    await Promise.all([appendMarker(0), appendMarker(1)])

    expect(await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true },
    })).toEqual({ name: "Serializable barrier!!" })
    expect(attempts.reduce((total, value) => total + value, 0)).toBeGreaterThanOrEqual(3)
    expect(attempts.some((value) => value > 1)).toBe(true)
  })

  it("allows exactly one of two concurrent full settlements and persists one complete side-effect set", async () => {
    const [debtor, creditor] = await Promise.all([
      createUser("Concurrent debtor"),
      createUser("Concurrent creditor"),
    ])
    const group = await createDebtGroup(debtor, creditor, 25_000)
    const command = {
      groupId: group.id,
      toUserId: creditor.id,
      amount: 25_000,
      currency: "RUB",
      date: operationDate,
    }

    const results = await Promise.allSettled([
      createSettlement(debtor.id, command),
      createSettlement(debtor.id, command),
    ])

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected")
    expect(rejected).toBeDefined()
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(Error)
    expect((rejected as PromiseRejectedResult).reason.message).toBe("NO_DEBT")

    const settlements = await prisma.settlement.findMany({
      where: { groupId: group.id, expenseId: null },
      select: { id: true, amount: true, amountBase: true },
    })
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ amount: 25_000, amountBase: 25_000 })

    const [activities, sentFacts, receivedFacts, returnedFacts] = await Promise.all([
      prisma.activityLog.count({
        where: {
          groupId: group.id,
          type: "SETTLEMENT_CREATED",
          entityId: settlements[0].id,
        },
      }),
      prisma.userStatisticFact.count({
        where: { userId: debtor.id, kind: "SETTLEMENT_SENT", reference: settlements[0].id },
      }),
      prisma.userStatisticFact.count({
        where: { userId: creditor.id, kind: "SETTLEMENT_RECEIVED", reference: settlements[0].id },
      }),
      prisma.userStatisticFact.count({
        where: { userId: creditor.id, kind: "MONEY_RETURNED", reference: settlements[0].id },
      }),
    ])
    expect({ activities, sentFacts, receivedFacts, returnedFacts }).toEqual({
      activities: 1,
      sentFacts: 1,
      receivedFacts: 1,
      returnedFacts: 1,
    })
  })

  it("serializes repeated concurrent settlement writers without deadlock exhaustion", async () => {
    const rounds = 6

    for (let round = 0; round < rounds; round += 1) {
      const [debtor, creditor] = await Promise.all([
        createUser(`Deadlock debtor ${round}`),
        createUser(`Deadlock creditor ${round}`),
      ])
      const group = await createDebtGroup(debtor, creditor, 10_000 + round)
      const command = {
        groupId: group.id,
        toUserId: creditor.id,
        amount: 10_000 + round,
        currency: "RUB",
        date: operationDate,
      }

      const results = await Promise.allSettled([
        createSettlement(debtor.id, command),
        createSettlement(debtor.id, command),
      ])
      const fulfilled = results.filter((result) => result.status === "fulfilled")
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      )

      expect(fulfilled, `round ${round}`).toHaveLength(1)
      expect(rejected, `round ${round}`).toHaveLength(1)
      expect(rejected[0].reason, `round ${round}`).toBeInstanceOf(Error)
      expect(rejected[0].reason.message, `round ${round}`).toBe("NO_DEBT")
      expect(await prisma.settlement.count({
        where: { groupId: group.id, expenseId: null },
      }), `round ${round}`).toBe(1)
    }
  }, 30_000)

  it("commits two independent concurrent settlements in one group without a lock cycle", async () => {
    const [firstDebtor, secondDebtor, firstCreditor, secondCreditor] = await Promise.all([
      createUser("Parallel first debtor"),
      createUser("Parallel second debtor"),
      createUser("Parallel first creditor"),
      createUser("Parallel second creditor"),
    ])
    const group = await createGroup(firstDebtor.id, {
      name: "Parallel independent settlements",
      type: "OTHER",
      currency: "RUB",
      memberIds: [secondDebtor.id, firstCreditor.id, secondCreditor.id],
    })
    await createExpense(group.id, firstDebtor.id, {
      title: "First independent debt",
      amount: 11_000,
      currency: "RUB",
      date: operationDate,
      paidById: firstCreditor.id,
      splitType: "EXACT",
      splits: [{ userId: firstDebtor.id, amount: 11_000 }],
    })
    await createExpense(group.id, firstDebtor.id, {
      title: "Second independent debt",
      amount: 22_000,
      currency: "RUB",
      date: operationDate,
      paidById: secondCreditor.id,
      splitType: "EXACT",
      splits: [{ userId: secondDebtor.id, amount: 22_000 }],
    })

    const [first, second] = await Promise.all([
      createSettlement(firstDebtor.id, {
        groupId: group.id,
        toUserId: firstCreditor.id,
        amount: 11_000,
        currency: "RUB",
        date: operationDate,
      }),
      createSettlement(secondDebtor.id, {
        groupId: group.id,
        toUserId: secondCreditor.id,
        amount: 22_000,
        currency: "RUB",
        date: operationDate,
      }),
    ])

    expect(new Set([first.id, second.id]).size).toBe(2)
    expect(await prisma.settlement.count({
      where: { groupId: group.id, expenseId: null },
    })).toBe(2)
    expect(await prisma.groupMemberPosition.findMany({
      where: { groupId: group.id, balance: { not: 0 } },
    })).toEqual([])
  }, 15_000)

  it("returns one active invite from concurrent get-or-create calls", async () => {
    const admin = await createUser("Concurrent invite admin")
    const group = await createGroup(admin.id, {
      name: "Concurrent invite group",
      type: "TRIP",
      currency: "RUB",
      memberIds: [],
    })

    const [first, second] = await Promise.all([
      getOrCreateInvite(group.id, admin.id),
      getOrCreateInvite(group.id, admin.id),
    ])

    expect(second.id).toBe(first.id)
    expect(second.token).toBe(first.token)
    expect(await prisma.groupInvite.count({ where: { groupId: group.id, revoked: false } })).toBe(1)
    expect(
      await prisma.userStatisticFact.count({
        where: { userId: admin.id, kind: "INVITE_CREATED", reference: first.id },
      })
    ).toBe(1)
  })

  it("makes concurrent acceptance of the same invite by one user idempotent", async () => {
    const [admin, joiningUser] = await Promise.all([
      createUser("Concurrent accept admin"),
      createUser("Concurrent joining user"),
    ])
    const group = await createGroup(admin.id, {
      name: "Concurrent accept group",
      type: "HOME",
      currency: "RUB",
      memberIds: [],
    })
    const invite = await getOrCreateInvite(group.id, admin.id)

    const results = await Promise.all([
      acceptInvite(invite.token, joiningUser.id),
      acceptInvite(invite.token, joiningUser.id),
    ])

    expect(results).toEqual([{ groupId: group.id }, { groupId: group.id }])
    expect(
      await prisma.groupMember.count({
        where: { groupId: group.id, userId: joiningUser.id, isActive: true, role: "MEMBER" },
      })
    ).toBe(1)
    expect(
      await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_ADDED", entityId: joiningUser.id },
      })
    ).toBe(1)
    expect(
      await prisma.userStatisticFact.count({
        where: { userId: joiningUser.id, kind: "GROUP_JOINED_HOME", reference: group.id },
      })
    ).toBe(1)
  })

  it("adds a member once under concurrent admin commands", async () => {
    const [admin, member] = await Promise.all([
      createUser("Concurrent add admin"),
      createUser("Concurrent added member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Concurrent add group",
      type: "COUPLE",
      currency: "RUB",
      memberIds: [],
    })

    const results = await Promise.allSettled([
      addMember(group.id, admin.id, member.id),
      addMember(group.id, admin.id, member.id),
    ])

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected")
    expect((rejected as PromiseRejectedResult).reason.message).toBe("MEMBER_ALREADY_ACTIVE")
    expect(
      await prisma.groupMember.count({
        where: { groupId: group.id, userId: member.id, isActive: true, role: "MEMBER" },
      })
    ).toBe(1)
    expect(
      await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_ADDED", entityId: member.id },
      })
    ).toBe(1)
    expect(
      await prisma.userStatisticFact.count({
        where: { userId: member.id, kind: "GROUP_JOINED_COUPLE", reference: group.id },
      })
    ).toBe(1)
  })

  it("serializes a group rename with a member insert without a projection lock cycle", async () => {
    const [admin, member] = await Promise.all([
      createUser("Projection rename admin"),
      createUser("Projection concurrent member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Projection before rename",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })

    await Promise.all([
      updateGroup(group.id, admin.id, {
        name: "Projection after rename",
        description: "Concurrent projection update",
      }),
      addMember(group.id, admin.id, member.id),
    ])

    const [updatedGroup, memberships] = await Promise.all([
      prisma.group.findUniqueOrThrow({
        where: { id: group.id },
        select: { name: true, updatedAt: true },
      }),
      prisma.groupMember.findMany({
        where: { groupId: group.id },
        select: { userId: true, groupUpdatedAt: true },
      }),
    ])
    expect(updatedGroup.name).toBe("Projection after rename")
    expect(memberships.map(({ userId }) => userId).sort()).toEqual(
      [admin.id, member.id].sort()
    )
    expect(memberships.every(
      ({ groupUpdatedAt }) => groupUpdatedAt.getTime() === updatedGroup.updatedAt.getTime()
    )).toBe(true)
  })

  it("records the true active-group maximum under concurrent group creation", async () => {
    const admin = await createUser("Concurrent group creator")

    await Promise.all([
      createGroup(admin.id, {
        name: "Concurrent group one",
        type: "HOME",
        currency: "RUB",
        memberIds: [],
      }),
      createGroup(admin.id, {
        name: "Concurrent group two",
        type: "TRIP",
        currency: "RUB",
        memberIds: [],
      }),
    ])

    expect((await getHistoricalUserStatistics(admin.id)).activeGroups).toBe(2)
  })
})
