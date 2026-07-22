export const BASE_CURRENCY = "RUB"

export const SUPPORTED_CURRENCIES = ["RUB", "USD", "EUR", "AMD"] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_META: Record<SupportedCurrency, { label: string; symbol: string }> = {
  RUB: { label: "Рубль", symbol: "₽" },
  USD: { label: "Доллар", symbol: "$" },
  EUR: { label: "Евро", symbol: "€" },
  AMD: { label: "Армянский драм", symbol: "֏" },
}

export function isSupportedCurrency(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c)
}
