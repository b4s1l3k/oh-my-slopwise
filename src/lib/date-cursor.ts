import { parseCalendarDate } from "@/lib/utils/calendar-date"

const MAX_CURSOR_LENGTH = 2_048

export type DateCursor = {
  date: Date
  createdAt: Date
  id: string
}

export function encodeDateCursor(row: DateCursor): string {
  return Buffer.from(JSON.stringify([
    row.date.toISOString().slice(0, 10),
    row.createdAt.toISOString(),
    row.id,
  ])).toString("base64url")
}

export function decodeDateCursor(cursor: string): DateCursor {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) throw new Error("INVALID_CURSOR")
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (!Array.isArray(value) || value.length !== 3) throw new Error("INVALID_CURSOR")
    const [dateValue, createdAtValue, id] = value
    if (
      typeof dateValue !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) ||
      typeof createdAtValue !== "string" ||
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 256
    ) {
      throw new Error("INVALID_CURSOR")
    }
    const date = parseCalendarDate(dateValue)
    const createdAt = new Date(createdAtValue)
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== createdAtValue) {
      throw new Error("INVALID_CURSOR")
    }
    return { date, createdAt, id }
  } catch {
    throw new Error("INVALID_CURSOR")
  }
}
