const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Converts a strict date-only value into the UTC midnight that represents its
 * literal calendar day.
 */
export function parseCalendarDate(value: string): Date {
  const match = CALENDAR_DATE_PATTERN.exec(value)
  if (!match) throw new Error("INVALID_CALENDAR_DATE")

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const result = new Date(0)
  result.setUTCHours(0, 0, 0, 0)
  result.setUTCFullYear(year, month - 1, day)

  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error("INVALID_CALENDAR_DATE")
  }
  return result
}

export function isValidCalendarDate(value: string): boolean {
  try {
    parseCalendarDate(value)
    return true
  } catch {
    return false
  }
}
