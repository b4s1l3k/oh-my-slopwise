import { beforeEach, describe, expect, it, vi } from "vitest"
import { encodeActivityCursor } from "@/lib/activity-cursor"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}))

import {
  DEFAULT_ACTIVITY_PAGE_SIZE,
  getAccountActivity,
} from "@/services/activity.service"

const first = {
  id: "activity-z",
  groupId: "group-1",
  actorId: "user-1",
  type: "GROUP_UPDATED" as const,
  entityType: "group",
  entityId: "group-1",
  metadata: {},
  createdAt: new Date("2026-09-15T12:00:00.000Z"),
  actor: { id: "user-1", name: "Alice" },
  group: { id: "group-1", name: "Trip" },
}

describe("getAccountActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryRaw.mockResolvedValue([])
  })

  it("queries only active groups in stable descending order", async () => {
    await getAccountActivity("user-1")

    expect(mocks.queryRaw).toHaveBeenCalledOnce()
    const query = mocks.queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] }
    expect(query.strings.join("?")).toContain("WITH active_groups AS MATERIALIZED")
    expect(query.strings.join("?")).toContain('membership."isActive" = true')
    expect(query.strings.join("?")).toContain("JOIN LATERAL")
    expect(query.strings.join("?")).toContain('candidate."groupId" = active_groups."groupId"')
    expect(query.strings.join("?")).toContain('ORDER BY activity."createdAt" DESC, activity."id" DESC')
    expect(query.values).toEqual([
      "user-1",
      DEFAULT_ACTIVITY_PAGE_SIZE + 1,
      DEFAULT_ACTIVITY_PAGE_SIZE + 1,
    ])
  })

  it("returns a cursor from the last visible row when another row exists", async () => {
    const second = {
      ...first,
      id: "activity-y",
      createdAt: new Date("2026-09-15T11:00:00.000Z"),
    }
    mocks.queryRaw.mockResolvedValue([raw(first), raw(second)])

    await expect(getAccountActivity("user-1", null, 1)).resolves.toEqual({
      activities: [first],
      nextCursor: encodeActivityCursor(first),
    })
    const query = mocks.queryRaw.mock.calls[0][0] as { values: unknown[] }
    expect(query.values).toEqual(["user-1", 2, 2])
  })

  it("uses both cursor keys and returns no cursor on the final page", async () => {
    const cursor = encodeActivityCursor(first)
    mocks.queryRaw.mockResolvedValue([raw({ ...first, id: "activity-a" })])

    const result = await getAccountActivity("user-1", cursor, 50)

    expect(result.nextCursor).toBeNull()
    const query = mocks.queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] }
    expect(query.strings.join("?")).toContain('candidate."createdAt" <')
    expect(query.strings.join("?")).toContain('candidate."id" <')
    expect(query.values).toEqual([
      "user-1",
      first.createdAt,
      first.createdAt,
      first.id,
      51,
      51,
    ])
  })

  it.each([0, -1, 51, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page size %s without querying",
    async (pageSize) => {
      await expect(getAccountActivity("user-1", null, pageSize))
        .rejects.toThrow("INVALID_PAGE_SIZE")
      expect(mocks.queryRaw).not.toHaveBeenCalled()
    }
  )

  it("rejects an invalid cursor without querying", async () => {
    await expect(getAccountActivity("user-1", "not-a-cursor", 1))
      .rejects.toThrow("INVALID_CURSOR")
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})

function raw(activity: typeof first) {
  return {
    id: activity.id,
    groupId: activity.groupId,
    actorId: activity.actorId,
    type: activity.type,
    entityType: activity.entityType,
    entityId: activity.entityId,
    metadata: activity.metadata,
    createdAt: activity.createdAt,
    actorName: activity.actor.name,
    groupName: activity.group.name,
  }
}
