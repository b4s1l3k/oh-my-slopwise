import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getAccountActivity } from "@/services/activity.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `activity-pagination-${Date.now()}`

describeDatabase("account activity persistence", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("paginates all and only active group activity with a stable id tie-break", async () => {
    const [viewer, actor] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-viewer@example.test`,
          name: "Activity Viewer",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-actor@example.test`,
          name: "Activity Actor",
          passwordHash: "test-only",
        },
      }),
    ])
    const [activeGroup, inactiveGroup, outsiderGroup] = await Promise.all([
      createGroup("active", actor.id, viewer.id, true),
      createGroup("inactive", actor.id, viewer.id, false),
      createGroup("outsider", actor.id),
    ])
    const newestAt = new Date("2098-09-15T12:00:00.000Z")
    const tiedAt = new Date("2098-09-15T11:00:00.000Z")

    await prisma.activityLog.createMany({
      data: [
        activity("activity-page-newest", activeGroup.id, actor.id, newestAt),
        activity("activity-page-tie-z", activeGroup.id, actor.id, tiedAt),
        activity("activity-page-tie-a", activeGroup.id, actor.id, tiedAt),
        activity("activity-page-inactive", inactiveGroup.id, actor.id, newestAt),
        activity("activity-page-outsider", outsiderGroup.id, actor.id, newestAt),
      ],
    })

    const firstPage = await getAccountActivity(viewer.id, null, 2)
    const secondPage = await getAccountActivity(viewer.id, firstPage.nextCursor, 2)

    expect(firstPage.activities.map((row) => row.id)).toEqual([
      "activity-page-newest",
      "activity-page-tie-z",
    ])
    expect(firstPage.nextCursor).toEqual(expect.any(String))
    expect(secondPage.activities.map((row) => row.id)).toEqual([
      "activity-page-tie-a",
    ])
    expect(secondPage.nextCursor).toBeNull()
    expect([...firstPage.activities, ...secondPage.activities].map((row) => row.id))
      .toEqual([
        "activity-page-newest",
        "activity-page-tie-z",
        "activity-page-tie-a",
      ])
    expect(firstPage.activities[0].group).toEqual({
      id: activeGroup.id,
      name: `${testPrefix}-active`,
    })
  })
})

function createGroup(
  suffix: string,
  ownerId: string,
  viewerId?: string,
  viewerIsActive = true
) {
  return prisma.group.create({
    data: {
      name: `${testPrefix}-${suffix}`,
      type: "OTHER",
      currency: "RUB",
      createdById: ownerId,
      members: {
        create: [
          { userId: ownerId, role: "ADMIN" },
          ...(viewerId
            ? [{ userId: viewerId, role: "MEMBER" as const, isActive: viewerIsActive }]
            : []),
        ],
      },
    },
  })
}

function activity(id: string, groupId: string, actorId: string, createdAt: Date) {
  return {
    id,
    groupId,
    actorId,
    type: "GROUP_UPDATED" as const,
    entityType: "group",
    entityId: groupId,
    metadata: { name: id },
    createdAt,
  }
}
