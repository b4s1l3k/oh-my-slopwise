import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createGroup, removeMember } from "@/services/groups.service"
import {
  acceptInvite,
  getInviteInfo,
  getOrCreateInvite,
  revokeInvite,
} from "@/services/invites.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `codex-invites-${Date.now()}`

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

describeDatabase("invites.service behavioral spec", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  describe("getOrCreateInvite", () => {
    it("lets any active member create an invite and is idempotent (returns the existing one)", async () => {
      const [admin, member] = await Promise.all([
        createUser("Invite Admin"),
        createUser("Invite Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Invite group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      // A non-admin active member is allowed to create the invite.
      const first = await getOrCreateInvite(group.id, member.id)
      expect(first.token).toBeTruthy()

      // Second call returns the same non-revoked invite rather than a new one.
      const second = await getOrCreateInvite(group.id, admin.id)
      expect(second.id).toBe(first.id)
      expect(second.token).toBe(first.token)

      expect(
        await prisma.groupInvite.count({ where: { groupId: group.id, revoked: false } })
      ).toBe(1)
    })

    it("rejects a non-member with FORBIDDEN", async () => {
      const [admin, outsider] = await Promise.all([
        createUser("Closed Admin"),
        createUser("Closed Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Closed group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })

      await expect(getOrCreateInvite(group.id, outsider.id)).rejects.toThrow("FORBIDDEN")
    })
  })

  describe("getInviteInfo", () => {
    it("returns groupId, groupName, active memberCount, and isAlreadyMember status", async () => {
      const [admin, member, extra, outsider] = await Promise.all([
        createUser("Info Admin"),
        createUser("Info Member"),
        createUser("Info Extra"),
        createUser("Info Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Info group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id, extra.id],
      })
      const invite = await getOrCreateInvite(group.id, admin.id)

      const forMember = await getInviteInfo(invite.token, member.id)
      expect(forMember).toEqual({
        groupId: group.id,
        groupName: "Info group",
        memberCount: 3,
        isAlreadyMember: true,
      })

      const forOutsider = await getInviteInfo(invite.token, outsider.id)
      expect(forOutsider).toMatchObject({
        groupId: group.id,
        memberCount: 3,
        isAlreadyMember: false,
      })

      // memberCount only counts active memberships.
      await removeMember(group.id, admin.id, extra.id)
      const afterRemoval = await getInviteInfo(invite.token, outsider.id)
      expect(afterRemoval?.memberCount).toBe(2)
    })

    it("returns null for an unknown token", async () => {
      const outsider = await createUser("Unknown Token User")
      expect(await getInviteInfo("no-such-token", outsider.id)).toBeNull()
    })
  })

  describe("acceptInvite", () => {
    it("adds a new user as MEMBER and logs a MEMBER_ADDED activity", async () => {
      const [admin, joiner] = await Promise.all([
        createUser("Join Admin"),
        createUser("Joiner"),
      ])
      const group = await createGroup(admin.id, {
        name: "Joinable group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })
      const invite = await getOrCreateInvite(group.id, admin.id)

      const result = await acceptInvite(invite.token, joiner.id)
      expect(result).toEqual({ groupId: group.id })

      const row = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: joiner.id } },
        select: { isActive: true, role: true },
      })
      expect(row).toEqual({ isActive: true, role: "MEMBER" })

      const log = await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_ADDED", entityId: joiner.id },
      })
      expect(log).toBe(1)
    })

    it("is a no-op for an already active member (returns groupId, no duplicate activity)", async () => {
      const [admin, member] = await Promise.all([
        createUser("Noop Admin"),
        createUser("Noop Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Noop group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })
      const invite = await getOrCreateInvite(group.id, admin.id)

      const result = await acceptInvite(invite.token, member.id)
      expect(result).toEqual({ groupId: group.id })

      const log = await prisma.activityLog.count({
        where: { groupId: group.id, type: "MEMBER_ADDED", entityId: member.id },
      })
      expect(log).toBe(0)
    })

    it("throws INVITE_INVALID for an unknown token", async () => {
      const outsider = await createUser("Bad Token User")
      await expect(acceptInvite("no-such-token", outsider.id)).rejects.toThrow("INVITE_INVALID")
    })

    it("brings a previously-removed member back as MEMBER, never restoring ADMIN", async () => {
      const [admin, former] = await Promise.all([
        createUser("Rejoin Admin"),
        createUser("Former Admin"),
      ])
      const group = await createGroup(admin.id, {
        name: "Rejoin group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [former.id],
      })
      const invite = await getOrCreateInvite(group.id, admin.id)

      // Simulate a former admin who has since been deactivated.
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: group.id, userId: former.id } },
        data: { role: "ADMIN", isActive: false },
      })

      await acceptInvite(invite.token, former.id)

      const row = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: former.id } },
        select: { isActive: true, role: true },
      })
      expect(row).toEqual({ isActive: true, role: "MEMBER" })
    })
  })

  describe("revokeInvite", () => {
    it("rejects a non-admin member with FORBIDDEN", async () => {
      const [admin, member] = await Promise.all([
        createUser("Revoke Admin"),
        createUser("Revoke Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Revoke guard group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })
      await getOrCreateInvite(group.id, admin.id)

      await expect(revokeInvite(group.id, member.id)).rejects.toThrow("FORBIDDEN")
    })

    it("invalidates the invite so getInviteInfo returns null and acceptInvite throws INVITE_INVALID", async () => {
      const [admin, outsider] = await Promise.all([
        createUser("Revoke Owner"),
        createUser("Late Joiner"),
      ])
      const group = await createGroup(admin.id, {
        name: "Revoked-link group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })
      const invite = await getOrCreateInvite(group.id, admin.id)

      await revokeInvite(group.id, admin.id)

      expect(await getInviteInfo(invite.token, outsider.id)).toBeNull()
      await expect(acceptInvite(invite.token, outsider.id)).rejects.toThrow("INVITE_INVALID")
    })
  })
})
