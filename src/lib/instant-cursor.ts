const MAX_CURSOR_LENGTH = 2_048

export type InstantCursor = {
  updatedAt: Date
  id: string
}

export function encodeInstantCursor(row: InstantCursor): string {
  return Buffer.from(JSON.stringify([
    row.updatedAt.toISOString(),
    row.id,
  ])).toString("base64url")
}

export function decodeInstantCursor(cursor: string): InstantCursor {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) throw new Error("INVALID_CURSOR")
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (!Array.isArray(value) || value.length !== 2) throw new Error("INVALID_CURSOR")
    const [updatedAtValue, id] = value
    if (
      typeof updatedAtValue !== "string" ||
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 256
    ) {
      throw new Error("INVALID_CURSOR")
    }
    const updatedAt = new Date(updatedAtValue)
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString() !== updatedAtValue) {
      throw new Error("INVALID_CURSOR")
    }
    return { updatedAt, id }
  } catch {
    throw new Error("INVALID_CURSOR")
  }
}
