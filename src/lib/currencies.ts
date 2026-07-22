export const BASE_CURRENCY = "RUB"

// Sorted by usage frequency (most common for Russian travelers first)
export const SUPPORTED_CURRENCIES = [
  "RUB", "USD", "EUR", "AMD",
  "GEL", "TRY", "THB", "AED",
  "GBP", "JPY", "CNY", "CHF",
  "CZK", "PLN", "HUF",
  "KZT", "UZS", "BYN", "AZN",
  "INR",
] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_META: Record<SupportedCurrency, { label: string; symbol: string }> = {
  RUB: { label: "Российский рубль",     symbol: "₽"   },
  USD: { label: "Доллар США",           symbol: "$"   },
  EUR: { label: "Евро",                 symbol: "€"   },
  AMD: { label: "Армянский драм",        symbol: "֏"   },
  GEL: { label: "Грузинский лари",      symbol: "₾"   },
  TRY: { label: "Турецкая лира",        symbol: "₺"   },
  THB: { label: "Тайский бат",          symbol: "฿"   },
  AED: { label: "Дирхам ОАЭ",           symbol: "د.إ" },
  GBP: { label: "Фунт стерлингов",      symbol: "£"   },
  JPY: { label: "Японская иена",        symbol: "¥"   },
  CNY: { label: "Китайский юань",       symbol: "¥"   },
  CHF: { label: "Швейцарский франк",    symbol: "Fr"  },
  CZK: { label: "Чешская крона",        symbol: "Kč"  },
  PLN: { label: "Польский злотый",      symbol: "zł"  },
  HUF: { label: "Венгерский форинт",    symbol: "Ft"  },
  KZT: { label: "Казахстанский тенге",  symbol: "₸"   },
  UZS: { label: "Узбекский сум",        symbol: "сўм" },
  BYN: { label: "Белорусский рубль",    symbol: "Br"  },
  AZN: { label: "Азербайджанский манат",symbol: "₼"   },
  INR: { label: "Индийская рупия",      symbol: "₹"   },
}

export function isSupportedCurrency(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c)
}
