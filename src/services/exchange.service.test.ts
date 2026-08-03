import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { BASE_CURRENCY } from "@/lib/currencies"
import { convertBetween, convertToRub, getRateToRub } from "@/services/exchange.service"

// Behavioral SPEC for a future rewrite: assert the ACTUAL behavior of
// exchange.service against the cached `exchange_rates` table ONLY.
//
// IMPORTANT: these tests never hit the real CBR network. Every path exercised
// here is satisfied purely from a pre-seeded cache row for the exact
// UTC-midnight day, so `getRateToRub` returns before its `fetch`/catch branch.
// Any (date, currency) pair without a cached row would trigger a live CBR
// fetch and is therefore intentionally NOT exercised.
//
// GAP: `getNearestCachedRate` is NOT exported and is only reachable through the
// catch-block fallback inside `getRateToRub`, which only runs after a live CBR
// `fetch` for an uncached day throws. Reaching it would require either a real
// network fetch or an uncached historical date (which also fetches), both of
// which are forbidden here. Its "nearest known rate" logic is therefore left
// uncovered by design.

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip

// Fixed, far-future UTC-midnight days that are extremely unlikely to collide
// with anything seeded by the real application. Each row we insert is removed
// in afterAll by these exact dates.
const DAY_USD = new Date(Date.UTC(2099, 0, 10)) // 2099-01-10
const DAY_CROSS = new Date(Date.UTC(2099, 0, 11)) // 2099-01-11
const SEEDED_DATES = [DAY_USD, DAY_CROSS]

describeDatabase("exchange.service cached-rate behavior", () => {
  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({
      where: { date: { in: SEEDED_DATES } },
    })
    await prisma.$disconnect()
  })

  it("returns 1 for the base currency without reading the DB", async () => {
    // BASE_CURRENCY short-circuits before any cache lookup: no row is required.
    const anyDate = new Date(Date.UTC(2099, 5, 30))
    expect(await getRateToRub(BASE_CURRENCY, anyDate)).toBe(1)
  })

  it("returns the cached rate for the exact UTC-midnight day", async () => {
    await prisma.exchangeRate.createMany({
      data: [{ date: DAY_USD, currency: "USD", rate: 90 }],
      skipDuplicates: true,
    })

    expect(await getRateToRub("USD", DAY_USD)).toBe(90)
  })

  it("normalizes a date with a time component to UTC midnight before lookup", async () => {
    // Same calendar day as the seeded row but with a non-midnight time part.
    // toDay() truncates to UTC midnight, so the cached value is still found.
    const sameDayWithTime = new Date(Date.UTC(2099, 0, 10, 17, 45, 30, 123))
    expect(await getRateToRub("USD", sameDayWithTime)).toBe(90)
  })

  it("convertToRub multiplies by the cached rate and rounds", async () => {
    // 10000 cents of USD at rate 90 => round(10000 * 90) = 900000
    expect(await convertToRub(10_000, "USD", DAY_USD)).toBe(900_000)
  })

  it("convertBetween returns the amount unchanged when from === to", async () => {
    // No rate lookup happens on the identity path.
    expect(await convertBetween(12_345, "USD", "USD", DAY_USD)).toBe(12_345)
  })

  it("convertBetween computes the cross-rate through RUB and rounds", async () => {
    await prisma.exchangeRate.createMany({
      data: [
        { date: DAY_CROSS, currency: "USD", rate: 90 },
        { date: DAY_CROSS, currency: "EUR", rate: 100 },
      ],
      skipDuplicates: true,
    })

    // round(10000 * rateFrom(USD=90) / rateTo(EUR=100)) = round(9000) = 9000
    expect(await convertBetween(10_000, "USD", "EUR", DAY_CROSS)).toBe(9_000)
  })
})

// Покрываем сетевой путь getRateToRub детерминированно, ПОДМЕНЯЯ global.fetch
// фикстурой XML в формате ЦБ РФ (без реальной сети). Так покрывается парсер
// fetchCbrRates, запись в кэш и fallback getNearestCachedRate в catch-ветке.
const FETCH_DAY = new Date(Date.UTC(2098, 1, 15)) // uncached день для успешного fetch
const NEAREST_SEED = new Date(Date.UTC(2098, 2, 10)) // сюда кладём курс вручную
const NEAREST_ASK = new Date(Date.UTC(2098, 2, 12)) // рядом, но uncached → fallback

function cbrXml(rows: Array<{ code: string; nominal: number; value: string }>) {
  const body = rows
    .map(
      (r) =>
        `<Valute><CharCode>${r.code}</CharCode><Nominal>${r.nominal}</Nominal><Value>${r.value}</Value></Valute>`
    )
    .join("")
  return `<?xml version="1.0"?><ValCurs>${body}</ValCurs>`
}

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(impl))
}

describeDatabase("exchange.service network path (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({
      where: { date: { in: [FETCH_DAY, NEAREST_SEED] } },
    })
    await prisma.$disconnect()
  })

  it("fetches, parses CBR XML (value/nominal), caches and returns the rate", async () => {
    stubFetch(async () => ({
      ok: true,
      // код читает latin1; поля ASCII, поэтому latin1-буфер корректен
      arrayBuffer: async () =>
        Buffer.from(cbrXml([{ code: "USD", nominal: 1, value: "90,50" }]), "latin1"),
    }))

    // uncached день → идём в (замоканный) fetch
    expect(await getRateToRub("USD", FETCH_DAY)).toBe(90.5)

    // и результат осел в кэше
    const cached = await prisma.exchangeRate.findUnique({
      where: { date_currency: { date: FETCH_DAY, currency: "USD" } },
    })
    expect(cached?.rate).toBe(90.5)
  })

  it("делит value на nominal (например, за 10 единиц)", async () => {
    stubFetch(async () => ({
      ok: true,
      arrayBuffer: async () =>
        Buffer.from(cbrXml([{ code: "SEK", nominal: 10, value: "85,00" }]), "latin1"),
    }))
    // 85,00 за 10 единиц → 8.5 за одну
    expect(await getRateToRub("SEK", FETCH_DAY)).toBe(8.5)
  })

  it("при недоступности ЦБ берёт ближайший по дате кэшированный курс", async () => {
    await prisma.exchangeRate.createMany({
      data: [{ date: NEAREST_SEED, currency: "USD", rate: 80 }],
      skipDuplicates: true,
    })
    stubFetch(async () => {
      throw new Error("network down")
    })
    // uncached день рядом с посевом; fetch падает → fallback на ближайший (80)
    expect(await getRateToRub("USD", NEAREST_ASK)).toBe(80)
  })

  it("если ЦБ недоступен и кэша нет вовсе → RATE_UNAVAILABLE", async () => {
    stubFetch(async () => {
      throw new Error("network down")
    })
    // валюта, которой заведомо нет в кэше
    await expect(getRateToRub("ZZZ", NEAREST_ASK)).rejects.toThrow("RATE_UNAVAILABLE")
  })

  it("ответ ЦБ не ok → тоже уходит в fallback/ошибку, не роняя необработанное", async () => {
    stubFetch(async () => ({ ok: false, arrayBuffer: async () => Buffer.from("") }))
    await expect(getRateToRub("ZZZ", NEAREST_ASK)).rejects.toThrow("RATE_UNAVAILABLE")
  })
})

// Отдельно покрываем ВСЕ ветки выбора ближайшего курса getNearestCachedRate:
// только «после», ничья по расстоянию (берём «до») и «после ближе». Разные
// фиктивные валюты (AAA/BBB/CCC), чтобы посевы не мешали друг другу; fetch
// всегда падает, поэтому getRateToRub всегда уходит в fallback.
const NB_AFTER = new Date(Date.UTC(2097, 5, 20)) // только «после»
const NB_ASK_BEFORE = new Date(Date.UTC(2097, 5, 10))
const NB_TIE_BEFORE = new Date(Date.UTC(2097, 5, 8)) // ничья: по 2 дня в обе стороны
const NB_TIE_AFTER = new Date(Date.UTC(2097, 5, 12))
const NB_TIE_ASK = new Date(Date.UTC(2097, 5, 10))
const NB_FAR_BEFORE = new Date(Date.UTC(2097, 5, 1)) // «после» ближе, чем «до»
const NB_NEAR_AFTER = new Date(Date.UTC(2097, 5, 11))
const NB_ASK = new Date(Date.UTC(2097, 5, 10))

describeDatabase("getNearestCachedRate — выбор ближайшего курса (fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({ where: { currency: { in: ["AAA", "BBB", "CCC"] } } })
    await prisma.$disconnect()
  })

  it("нет курса «до» → берётся ближайший «после»", async () => {
    await prisma.exchangeRate.createMany({
      data: [{ date: NB_AFTER, currency: "AAA", rate: 70 }],
      skipDuplicates: true,
    })
    stubFetch(async () => {
      throw new Error("network down")
    })
    expect(await getRateToRub("AAA", NB_ASK_BEFORE)).toBe(70)
  })

  it("равное расстояние в обе стороны → берётся «до» (<=)", async () => {
    await prisma.exchangeRate.createMany({
      data: [
        { date: NB_TIE_BEFORE, currency: "BBB", rate: 60 },
        { date: NB_TIE_AFTER, currency: "BBB", rate: 62 },
      ],
      skipDuplicates: true,
    })
    stubFetch(async () => {
      throw new Error("network down")
    })
    expect(await getRateToRub("BBB", NB_TIE_ASK)).toBe(60)
  })

  it("«после» ближе «до» → берётся «после»", async () => {
    await prisma.exchangeRate.createMany({
      data: [
        { date: NB_FAR_BEFORE, currency: "CCC", rate: 50 },
        { date: NB_NEAR_AFTER, currency: "CCC", rate: 52 },
      ],
      skipDuplicates: true,
    })
    stubFetch(async () => {
      throw new Error("network down")
    })
    expect(await getRateToRub("CCC", NB_ASK)).toBe(52)
  })
})
