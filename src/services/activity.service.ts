import { prisma } from "@/lib/db"
import { decodeActivityCursor, encodeActivityCursor } from "@/lib/activity-cursor"
import { Prisma, type ActivityType } from "@prisma/client"

export const MAX_ACTIVITY_PAGE_SIZE = 50
export const DEFAULT_ACTIVITY_PAGE_SIZE = 50

type AccountActivityRow = {
  id: string
  groupId: string
  actorId: string
  type: ActivityType
  entityType: string
  entityId: string
  metadata: Prisma.JsonValue
  createdAt: Date
  actorName: string
  groupName: string
}

export async function getAccountActivity(
  userId: string,
  cursor?: string | null,
  pageSize = DEFAULT_ACTIVITY_PAGE_SIZE
) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_ACTIVITY_PAGE_SIZE) {
    throw new Error("INVALID_PAGE_SIZE")
  }

  const decodedCursor = cursor == null ? null : decodeActivityCursor(cursor)
  const cursorFilter = decodedCursor
    ? Prisma.sql`
        AND (
          candidate."createdAt" < ${decodedCursor.createdAt}
          OR (
            candidate."createdAt" = ${decodedCursor.createdAt}
            AND candidate."id" < ${decodedCursor.id}
          )
        )
      `
    : Prisma.empty

  const rows = await prisma.$queryRaw<AccountActivityRow[]>(Prisma.sql`
    WITH active_groups AS MATERIALIZED (
      SELECT membership."groupId"
      FROM "group_members" membership
      WHERE membership."userId" = ${userId}
        AND membership."isActive" = true
    )
    SELECT
      activity."id",
      activity."groupId",
      activity."actorId",
      activity."type",
      activity."entityType",
      activity."entityId",
      activity."metadata",
      activity."createdAt",
      actor."name" AS "actorName",
      group_data."name" AS "groupName"
    FROM active_groups
    JOIN LATERAL (
      SELECT candidate.*
      FROM "activity_log" candidate
      WHERE candidate."groupId" = active_groups."groupId"
      ${cursorFilter}
      ORDER BY candidate."createdAt" DESC, candidate."id" DESC
      LIMIT ${pageSize + 1}
    ) activity ON true
    JOIN "users" actor
      ON actor."id" = activity."actorId"
    JOIN "groups" group_data
      ON group_data."id" = activity."groupId"
    ORDER BY activity."createdAt" DESC, activity."id" DESC
    LIMIT ${pageSize + 1}
  `)
  const activities = rows.slice(0, pageSize).map((row) => ({
    id: row.id,
    groupId: row.groupId,
    actorId: row.actorId,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    createdAt: row.createdAt,
    actor: { id: row.actorId, name: row.actorName },
    group: { id: row.groupId, name: row.groupName },
  }))
  const lastActivity = activities.at(-1)

  return {
    activities,
    nextCursor: rows.length > pageSize && lastActivity
      ? encodeActivityCursor(lastActivity)
      : null,
  }
}
