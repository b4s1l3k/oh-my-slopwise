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
