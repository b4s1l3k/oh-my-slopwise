const MAX_CURSOR_LENGTH = 2_048

export type ActivityCursor = {
  createdAt: Date
  id: string
}

export function encodeActivityCursor(row: ActivityCursor): string {
  return Buffer.from(JSON.stringify([
    row.createdAt.toISOString(),
    row.id,
  ])).toString("base64url")
}

export function decodeActivityCursor(cursor: string): ActivityCursor {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new Error("INVALID_CURSOR")
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8")
    const value: unknown = JSON.parse(decoded)
    if (!Array.isArray(value) || value.length !== 2) throw new Error("INVALID_CURSOR")

    const [createdAtValue, id] = value
    if (
      typeof createdAtValue !== "string" ||
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 256
    ) {
      throw new Error("INVALID_CURSOR")
    }

    const createdAt = new Date(createdAtValue)
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== createdAtValue ||
      Buffer.from(decoded).toString("base64url") !== cursor
    ) {
      throw new Error("INVALID_CURSOR")
    }

    return { createdAt, id }
  } catch {
    throw new Error("INVALID_CURSOR")
  }
}
