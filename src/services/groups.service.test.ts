import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import {
  addMember,
  createGroup,
  deleteGroup,
  getGroup,
  getUserGroups,
  removeMember,
  updateGroup,
} from "@/services/groups.service"
import { createExpense } from "@/services/expenses.service"
import { createSettlement } from "@/services/settlements.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `codex-groups-${Date.now()}`

let userCounter = 0
async function createUser(name: string) {
  userCounter += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-${userCounter}@example.test`,
      name,
      passwordHash: "test-only",
    },
  })
}

const expenseDate = "2026-08-01"

describeDatabase("groups.service behavioral spec", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  describe("createGroup", () => {
    it("makes the creator an active ADMIN and listed members active MEMBERs, storing name/type/currency", async () => {
      const [admin, member] = await Promise.all([
        createUser("Create Admin"),
        createUser("Create Member"),
      ])

      const group = await createGroup(admin.id, {
        name: "Ski trip",
        description: "Winter 2026",
        type: "TRIP",
        currency: "RUB",
        memberIds: [member.id],
      })

      expect(group).toMatchObject({
        name: "Ski trip",
        description: "Winter 2026",
        type: "TRIP",
        currency: "RUB",
        createdById: admin.id,
      })

      const rows = await prisma.groupMember.findMany({
        where: { groupId: group.id },
        select: { userId: true, role: true, isActive: true },
      })
      const adminRow = rows.find((r) => r.userId === admin.id)
      const memberRow = rows.find((r) => r.userId === member.id)
      expect(adminRow).toEqual({ userId: admin.id, role: "ADMIN", isActive: true })
      expect(memberRow).toEqual({ userId: member.id, role: "MEMBER", isActive: true })
    })

    it("throws USER_NOT_FOUND when a memberId does not reference a real user", async () => {
      const admin = await createUser("Ghost Admin")
      await expect(
        createGroup(admin.id, {
          name: "Broken group",
          type: "OTHER",
          currency: "RUB",
          memberIds: ["non-existent-user-id"],
        })
      ).rejects.toThrow("USER_NOT_FOUND")
    })

    it("rejects a group larger than the bounded active-member limit", async () => {
      const admin = await createUser("Capacity Admin")

      await expect(createGroup(admin.id, {
        name: "Oversized group",
        type: "OTHER",
        currency: "RUB",
        memberIds: Array.from({ length: 100 }, (_, index) => `member-${index}`),
      })).rejects.toThrow("GROUP_MEMBER_LIMIT")
    })
  })

  describe("getUserGroups / getGroup", () => {
    it("lets a member read via getUserGroups and getGroup", async () => {
      const [admin, member] = await Promise.all([
        createUser("Read Admin"),
        createUser("Read Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Readable group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const { groups: memberGroups } = await getUserGroups(member.id)
      expect(memberGroups.map((g) => g.id)).toContain(group.id)

      const readByMember = await getGroup(group.id, member.id)
      expect(readByMember?.id).toBe(group.id)
    })

    it("returns stable bounded cursor pages without duplicates at equal timestamps", async () => {
      const admin = await createUser("Paged Admin")
      const rows = [
        { id: `${testPrefix}-page-a`, updatedAt: new Date("2026-08-01T10:00:00.000Z") },
        { id: `${testPrefix}-page-b`, updatedAt: new Date("2026-08-03T10:00:00.000Z") },
        { id: `${testPrefix}-page-c`, updatedAt: new Date("2026-08-03T10:00:00.000Z") },
        { id: `${testPrefix}-page-d`, updatedAt: new Date("2026-08-02T10:00:00.000Z") },
        { id: `${testPrefix}-page-e`, updatedAt: new Date("2026-07-31T10:00:00.000Z") },
      ]
      for (const row of rows) {
        await prisma.group.create({
          data: {
            id: row.id,
            name: row.id,
            type: "OTHER",
            currency: "RUB",
            createdById: admin.id,
            updatedAt: row.updatedAt,
            members: {
              create: { userId: admin.id, role: "ADMIN" },
            },
          },
        })
      }

      const first = await getUserGroups(admin.id, null, 2)
      const second = await getUserGroups(admin.id, first.nextCursor, 2)
      const third = await getUserGroups(admin.id, second.nextCursor, 2)

      expect([
        ...first.groups,
        ...second.groups,
        ...third.groups,
      ].map((group) => group.id)).toEqual([
        `${testPrefix}-page-c`,
        `${testPrefix}-page-b`,
        `${testPrefix}-page-d`,
        `${testPrefix}-page-a`,
        `${testPrefix}-page-e`,
      ])
      expect(first.nextCursor).not.toBeNull()
      expect(second.nextCursor).not.toBeNull()
      expect(third.nextCursor).toBeNull()
    })

    it("keeps the group feed timestamp synchronized for direct database writers", async () => {
      const [admin, member] = await Promise.all([
        createUser("Feed Projection Admin"),
        createUser("Feed Projection Member"),
      ])
      const historicalUpdatedAt = new Date("2026-01-02T03:04:05.678Z")
      const group = await prisma.group.create({
        data: {
          name: "Feed projection group",
          type: "OTHER",
          currency: "RUB",
          createdById: admin.id,
          updatedAt: historicalUpdatedAt,
          members: {
            create: { userId: admin.id, role: "ADMIN" },
          },
        },
      })

      const initialMembership = await prisma.groupMember.findUniqueOrThrow({
        where: { groupId_userId: { groupId: group.id, userId: admin.id } },
        select: { groupUpdatedAt: true },
      })
      expect(initialMembership.groupUpdatedAt).toEqual(historicalUpdatedAt)

      await prisma.$executeRaw`
        INSERT INTO "group_members" ("id", "groupId", "userId", "role")
        VALUES (${`${testPrefix}-feed-member`}, ${group.id}, ${member.id}, 'MEMBER'::"GroupMemberRole")
      `
      const insertedMembership = await prisma.groupMember.findUniqueOrThrow({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        select: { groupUpdatedAt: true },
      })
      expect(insertedMembership.groupUpdatedAt).toEqual(historicalUpdatedAt)

      const [updatedGroup] = await prisma.$queryRaw<Array<{ updatedAt: Date }>>`
        UPDATE "groups"
        SET "name" = 'Feed projection group updated'
        WHERE "id" = ${group.id}
        RETURNING "updatedAt"
      `
      const projectedMemberships = await prisma.groupMember.findMany({
        where: { groupId: group.id },
        select: { groupUpdatedAt: true },
      })
      expect(projectedMemberships).toHaveLength(2)
      expect(projectedMemberships.every(
        ({ groupUpdatedAt }) => groupUpdatedAt.getTime() === updatedGroup.updatedAt.getTime()
      )).toBe(true)

      await prisma.$executeRaw`
        UPDATE "group_members"
        SET "groupUpdatedAt" = ${historicalUpdatedAt}
        WHERE "groupId" = ${group.id}
      `
      const correctedMemberships = await prisma.groupMember.findMany({
        where: { groupId: group.id },
        select: { groupUpdatedAt: true },
      })
      expect(correctedMemberships.every(
        ({ groupUpdatedAt }) => groupUpdatedAt.getTime() === updatedGroup.updatedAt.getTime()
      )).toBe(true)
    })

    it("does not expose member requisites in the group list", async () => {
      const [admin, member] = await Promise.all([
        createUser("List Privacy Admin"),
        createUser("List Privacy Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Private requisites list",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: group.id, userId: admin.id } },
        data: {
          payeeName: "Secret Recipient",
          bankName: "Secret Bank",
          payeeAccount: "Secret Account",
        },
      })

      const listedGroup = (await getUserGroups(member.id)).groups.find(({ id }) => id === group.id)
      const listedAdmin = listedGroup?.members.find(({ userId }) => userId === admin.id)

      expect(listedAdmin).toBeDefined()
      expect(listedAdmin).not.toHaveProperty("payeeName")
      expect(listedAdmin).not.toHaveProperty("bankName")
      expect(listedAdmin).not.toHaveProperty("payeeAccount")
    })

    it("returns null for a non-member calling getGroup (no visibility)", async () => {
      // SPEC intent: a non-member should be denied. The current implementation
      // signals this by returning null rather than throwing "FORBIDDEN".
      const [admin, outsider] = await Promise.all([
        createUser("Owner Admin"),
        createUser("Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Private group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })

      expect(await getGroup(group.id, outsider.id)).toBeNull()
    })

    it("exposes only the caller's own requisites and those of members they OWE", async () => {
      const [admin, debtor, unrelated] = await Promise.all([
        createUser("Requisite Admin"),
        createUser("Requisite Debtor"),
        createUser("Requisite Unrelated"),
      ])
      const group = await createGroup(admin.id, {
        name: "Requisites group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [debtor.id, unrelated.id],
      })

      // Give every membership per-group requisites.
      for (const userId of [admin.id, debtor.id, unrelated.id]) {
        await prisma.groupMember.update({
          where: { groupId_userId: { groupId: group.id, userId } },
          data: {
            payeeName: `Payee ${userId}`,
            bankName: `Bank ${userId}`,
            payeeAccount: `Acct ${userId}`,
          },
        })
      }

      // admin pays 1000 split equally with debtor -> debtor owes admin 500.
      await createExpense(group.id, admin.id, {
        title: "Shared dinner",
        amount: 1000,
        currency: "RUB",
        date: expenseDate,
        paidById: admin.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }, { userId: debtor.id }],
      })

      const view = await getGroup(group.id, debtor.id)
      const selfRow = view?.members.find((m) => m.userId === debtor.id)
      const owedRow = view?.members.find((m) => m.userId === admin.id)
      const unrelatedRow = view?.members.find((m) => m.userId === unrelated.id)

      // Caller sees their own requisites.
      expect(selfRow?.payeeName).toBe(`Payee ${debtor.id}`)
      // Caller sees requisites of the member they owe (admin).
      expect(owedRow?.payeeName).toBe(`Payee ${admin.id}`)
      // Unrelated member requisites are nulled at both member and user level.
      expect(unrelatedRow).toMatchObject({
        payeeName: null,
        bankName: null,
        payeeAccount: null,
      })
    })
  })

  describe("updateGroup", () => {
    it("lets an ADMIN rename/redescribe and logs GROUP_UPDATED", async () => {
      const admin = await createUser("Update Admin")
      const group = await createGroup(admin.id, {
        name: "Old name",
        description: "Old description",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: group.id, userId: admin.id } },
        data: {
          payeeName: "Secret Recipient",
          bankName: "Secret Bank",
          payeeAccount: "Secret Account",
        },
      })

      const updated = await updateGroup(group.id, admin.id, {
        name: "New name",
        description: "New description",
      })
      expect(updated).toMatchObject({ name: "New name", description: "New description" })
      expect(updated.members[0]).not.toHaveProperty("payeeName")
      expect(updated.members[0]).not.toHaveProperty("bankName")
      expect(updated.members[0]).not.toHaveProperty("payeeAccount")

      const log = await prisma.activityLog.count({
        where: { groupId: group.id, type: "GROUP_UPDATED" },
      })
      expect(log).toBe(1)
    })

    it("rejects a non-admin member with FORBIDDEN", async () => {
      const [admin, member] = await Promise.all([
        createUser("Update Owner"),
        createUser("Update Peon"),
      ])
      const group = await createGroup(admin.id, {
        name: "Guarded group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      await expect(
        updateGroup(group.id, member.id, { name: "Hijacked" })
      ).rejects.toThrow("FORBIDDEN")
    })
  })

  describe("addMember", () => {
    it("rejects a non-admin caller with FORBIDDEN", async () => {
      const [admin, member, target] = await Promise.all([
        createUser("Add Admin"),
        createUser("Add Member"),
        createUser("Add Target"),
      ])
      const group = await createGroup(admin.id, {
        name: "Add group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      await expect(addMember(group.id, member.id, target.id)).rejects.toThrow("FORBIDDEN")
    })

    it("rejects re-adding an already active member with MEMBER_ALREADY_ACTIVE", async () => {
      const [admin, member] = await Promise.all([
        createUser("Dup Admin"),
        createUser("Dup Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Dup group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      await expect(addMember(group.id, admin.id, member.id)).rejects.toThrow(
        "MEMBER_ALREADY_ACTIVE"
      )
    })

    it("rejects adding a memberId that is not a real user with USER_NOT_FOUND", async () => {
      const admin = await createUser("Add NF Admin")
      const group = await createGroup(admin.id, {
        name: "Add NF group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })

      await expect(addMember(group.id, admin.id, "no-such-user")).rejects.toThrow(
        "USER_NOT_FOUND"
      )
    })

    it("re-activates a previously removed member as MEMBER and logs MEMBER_ADDED", async () => {
      const [admin, member] = await Promise.all([
        createUser("Reactivate Admin"),
        createUser("Reactivate Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Reactivate group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      // Member leaves (soft delete), zero balance.
      await removeMember(group.id, member.id, member.id)
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        data: {
          payeeName: "Old Recipient",
          bankName: "Old Bank",
          payeeAccount: "Old Account",
        },
      })

      const readded = await addMember(group.id, admin.id, member.id)
      expect(readded).toMatchObject({ isActive: true, role: "MEMBER" })
      expect(readded).not.toHaveProperty("payeeName")
      expect(readded).not.toHaveProperty("bankName")
      expect(readded).not.toHaveProperty("payeeAccount")

      const row = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        select: { isActive: true, role: true },
      })
      expect(row).toEqual({ isActive: true, role: "MEMBER" })

      const added = await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_ADDED", entityId: member.id },
      })
      expect(added).toBe(1)
    })
  })

  describe("removeMember", () => {
    it("rejects a non-admin removing another member with FORBIDDEN", async () => {
      const [admin, memberA, memberB] = await Promise.all([
        createUser("Remove Admin"),
        createUser("Remove A"),
        createUser("Remove B"),
      ])
      const group = await createGroup(admin.id, {
        name: "Remove group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [memberA.id, memberB.id],
      })

      await expect(removeMember(group.id, memberA.id, memberB.id)).rejects.toThrow("FORBIDDEN")
    })

    it("rejects removing a user who is not an active member with NOT_FOUND", async () => {
      const [admin, stranger] = await Promise.all([
        createUser("Remove NF Admin"),
        createUser("Remove NF Stranger"),
      ])
      const group = await createGroup(admin.id, {
        name: "Remove NF group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })
      // stranger — реальный пользователь, но не участник группы
      await expect(removeMember(group.id, admin.id, stranger.id)).rejects.toThrow("NOT_FOUND")
    })

    it("prevents the ADMIN from leaving with ADMIN_CANNOT_LEAVE", async () => {
      const admin = await createUser("Lonely Admin")
      const group = await createGroup(admin.id, {
        name: "Admin-only group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })

      await expect(removeMember(group.id, admin.id, admin.id)).rejects.toThrow(
        "ADMIN_CANNOT_LEAVE"
      )
    })

    it("blocks removal of a member with a non-zero balance, then allows it once settled", async () => {
      const [admin, member] = await Promise.all([
        createUser("Balance Admin"),
        createUser("Balance Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Balance group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      // admin pays 1000 split equally -> member owes admin 500.
      await createExpense(group.id, admin.id, {
        title: "Owed dinner",
        amount: 1000,
        currency: "RUB",
        date: expenseDate,
        paidById: admin.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }, { userId: member.id }],
      })

      await expect(removeMember(group.id, admin.id, member.id)).rejects.toThrow(
        "MEMBER_HAS_BALANCE"
      )

      // Settle the outstanding 500 debt.
      await createSettlement(member.id, {
        groupId: group.id,
        toUserId: admin.id,
        amount: 500,
        currency: "RUB",
        date: expenseDate,
      })

      const removed = await removeMember(group.id, admin.id, member.id)
      expect(removed.isActive).toBe(false)

      const row = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        select: { isActive: true },
      })
      expect(row).toEqual({ isActive: false })

      const log = await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_REMOVED", entityId: member.id },
      })
      expect(log).toBe(1)
    })

    it("lets a member leave themselves (soft delete) when their balance is zero", async () => {
      const [admin, member] = await Promise.all([
        createUser("Leave Admin"),
        createUser("Leave Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Leave group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const left = await removeMember(group.id, member.id, member.id)
      expect(left.isActive).toBe(false)

      const row = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        select: { isActive: true },
      })
      expect(row).toEqual({ isActive: false })
    })
  })

  describe("deleteGroup", () => {
    it("rejects a non-admin caller with FORBIDDEN", async () => {
      const [admin, member] = await Promise.all([
        createUser("Delete Admin"),
        createUser("Delete Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Undeletable-by-member group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      await expect(deleteGroup(group.id, member.id)).rejects.toThrow("FORBIDDEN")
      expect(await prisma.group.count({ where: { id: group.id } })).toBe(1)
    })

    it("refuses while balances remain, then removes the group and its expenses once settled", async () => {
      const [admin, member] = await Promise.all([
        createUser("Settle Admin"),
        createUser("Settle Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Settle-then-delete group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(group.id, admin.id, {
        title: "Outstanding dinner",
        amount: 1000,
        currency: "RUB",
        date: expenseDate,
        paidById: admin.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }, { userId: member.id }],
      })

      await expect(deleteGroup(group.id, admin.id)).rejects.toThrow("GROUP_HAS_BALANCES")
      expect(await prisma.group.count({ where: { id: group.id } })).toBe(1)

      await createSettlement(member.id, {
        groupId: group.id,
        toUserId: admin.id,
        amount: 500,
        currency: "RUB",
        date: expenseDate,
      })

      await deleteGroup(group.id, admin.id)
      expect(await prisma.group.count({ where: { id: group.id } })).toBe(0)
      expect(await prisma.expense.count({ where: { id: expense.id } })).toBe(0)
    })
  })
})
