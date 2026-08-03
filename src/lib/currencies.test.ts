import { describe, it, expect } from "vitest"
import {
  BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  isSupportedCurrency,
} from "@/lib/currencies"

describe("BASE_CURRENCY", () => {
  it("is the Russian rouble", () => {
    expect(BASE_CURRENCY).toBe("RUB")
  })

  it("is a supported currency", () => {
    expect(isSupportedCurrency(BASE_CURRENCY)).toBe(true)
  })

  it("is the first (highest priority) entry in the supported list", () => {
    expect(SUPPORTED_CURRENCIES[0]).toBe(BASE_CURRENCY)
    expect(SUPPORTED_CURRENCIES[0]).toBe("RUB")
  })
})

describe("SUPPORTED_CURRENCIES", () => {
  it("contains the base currency RUB", () => {
    expect(SUPPORTED_CURRENCIES).toContain("RUB")
  })

  it("has 20 currencies", () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(20)
  })

  it("lists the exact ordered set of codes", () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual([
      "RUB", "USD", "EUR", "AMD",
      "GEL", "TRY", "THB", "AED",
      "GBP", "JPY", "CNY", "CHF",
      "CZK", "PLN", "HUF",
      "KZT", "UZS", "BYN", "AZN",
      "INR",
    ])
  })

  it("contains a few well-known codes", () => {
    for (const code of ["USD", "EUR", "GBP", "JPY", "CNY", "TRY", "INR"]) {
      expect(SUPPORTED_CURRENCIES).toContain(code)
    }
  })

  it("has no duplicate codes", () => {
    expect(new Set(SUPPORTED_CURRENCIES).size).toBe(SUPPORTED_CURRENCIES.length)
  })
})

describe("isSupportedCurrency", () => {
  it("returns true for every supported currency code", () => {
    for (const code of SUPPORTED_CURRENCIES) {
      expect(isSupportedCurrency(code)).toBe(true)
    }
  })

  it("returns false for unknown codes", () => {
    expect(isSupportedCurrency("XXX")).toBe(false)
    expect(isSupportedCurrency("BTC")).toBe(false)
    expect(isSupportedCurrency("RU")).toBe(false)
    expect(isSupportedCurrency("RUBB")).toBe(false)
  })

  it("is case-sensitive and rejects lowercase variants", () => {
    expect(isSupportedCurrency("rub")).toBe(false)
    expect(isSupportedCurrency("usd")).toBe(false)
    expect(isSupportedCurrency("Rub")).toBe(false)
  })

  it("returns false for the empty string", () => {
    expect(isSupportedCurrency("")).toBe(false)
  })

  it("returns false for whitespace-padded codes", () => {
    expect(isSupportedCurrency(" RUB")).toBe(false)
    expect(isSupportedCurrency("RUB ")).toBe(false)
  })
})

describe("CURRENCY_META", () => {
  it("has an entry with a non-empty symbol for every supported currency", () => {
    for (const code of SUPPORTED_CURRENCIES) {
      const meta = CURRENCY_META[code]
      expect(meta, `missing meta for ${code}`).toBeDefined()
      expect(typeof meta.symbol).toBe("string")
      expect(meta.symbol.length).toBeGreaterThan(0)
      expect(typeof meta.label).toBe("string")
      expect(meta.label.length).toBeGreaterThan(0)
    }
  })

  it("has exactly the supported currencies as keys (no missing, no extra)", () => {
    expect(Object.keys(CURRENCY_META).sort()).toEqual([...SUPPORTED_CURRENCIES].sort())
  })

  it("exposes the expected symbols for well-known currencies", () => {
    expect(CURRENCY_META.RUB.symbol).toBe("₽")
    expect(CURRENCY_META.USD.symbol).toBe("$")
    expect(CURRENCY_META.EUR.symbol).toBe("€")
    expect(CURRENCY_META.GBP.symbol).toBe("£")
    expect(CURRENCY_META.JPY.symbol).toBe("¥")
    expect(CURRENCY_META.INR.symbol).toBe("₹")
  })

  it("exposes the expected label for the base currency", () => {
    expect(CURRENCY_META.RUB.label).toBe("Российский рубль")
  })

  it("shares the ¥ symbol between JPY and CNY", () => {
    expect(CURRENCY_META.JPY.symbol).toBe("¥")
    expect(CURRENCY_META.CNY.symbol).toBe("¥")
  })
})
