export function formatMoney(kopecks: number, currency = "RUB"): string {
  const amount = kopecks / 100
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

/** Formats a business calendar date without applying the viewer's timezone. */
export function formatCalendarDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

/** Formats a date for `<input type="date">` in the user's local timezone. */
export function toLocalDateInputValue(date: string | Date = new Date()): string {
  const value = new Date(date)
  const localTime = value.getTime() - value.getTimezoneOffset() * 60_000
  return new Date(localTime).toISOString().slice(0, 10)
}

/** Keeps an API business date on the same YYYY-MM-DD in every timezone. */
export function toCalendarDateInputValue(date?: string | Date): string {
  if (date == null) return toLocalDateInputValue()
  if (typeof date === "string") {
    const datePrefix = /^\d{4}-\d{2}-\d{2}/.exec(date)?.[0]
    if (datePrefix) return datePrefix
  }
  return new Date(date).toISOString().slice(0, 10)
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function parseMoneyInput(value: string): number {
  const num = parseFloat(value.replace(",", "."))
  if (isNaN(num) || num <= 0) return 0
  return Math.round(num * 100)
}
