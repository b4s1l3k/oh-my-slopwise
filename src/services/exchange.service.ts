import { prisma } from "@/lib/db"
import { BASE_CURRENCY } from "@/lib/currencies"

// Приводим дату к UTC-полуночи (курс привязан к календарному дню)
function toDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function cbrDateParam(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

// Забирает у ЦБ РФ курсы всех валют на день. Возвращает "рублей за 1 единицу".
async function fetchCbrRates(day: Date): Promise<Record<string, number>> {
  const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${cbrDateParam(day)}`
  const today = toDay(new Date())
  // Курсы прошлых дат никогда не меняются — кэшируем навсегда.
  // Курс текущего дня может ещё не выйти или обновиться — не кэшируем.
  const isHistorical = day.getTime() < today.getTime()

  const res = await fetch(url, {
    headers: { "User-Agent": "SLOPwise-personal" },
    cache: isHistorical ? "force-cache" : "no-store",
    // 5-секундный таймаут — CBR иногда тормозит, не хотим вешать весь запрос
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error("CBR_FETCH_FAILED")

  // XML в кодировке windows-1251; нужные поля (CharCode/Nominal/Value) — ASCII,
  // поэтому безопасно читаем как latin1 и парсим регуляркой (без доп. зависимостей)
  const xml = Buffer.from(await res.arrayBuffer()).toString("latin1")
  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 }
  const re =
    /<CharCode>([A-Z]{3})<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d,]+)<\/Value>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const code = m[1]
    const nominal = parseInt(m[2], 10)
    const value = parseFloat(m[3].replace(",", "."))
    if (nominal > 0 && value > 0) rates[code] = value / nominal
  }
  return rates
}

/**
 * Курс: сколько рублей стоит 1 единица `currency` на дату `date`.
 * Кэшируется в БД. При недоступности ЦБ используется ближайший известный курс.
 */
export async function getRateToRub(currency: string, date: Date): Promise<number> {
  if (currency === BASE_CURRENCY) return 1

  const day = toDay(date)

  const cached = await prisma.exchangeRate.findUnique({
    where: { date_currency: { date: day, currency } },
  })
  if (cached) return cached.rate

  try {
    const rates = await fetchCbrRates(day)
    // Один batch INSERT вместо 34 отдельных upsert — меньше lock contention
    await prisma.exchangeRate.createMany({
      data: Object.entries(rates).map(([cur, rate]) => ({ date: day, currency: cur, rate })),
      skipDuplicates: true,
    })
    if (rates[currency] != null) return rates[currency]
    throw new Error("RATE_UNAVAILABLE")
  } catch {
    // fallback: ближайший известный курс этой валюты
    // Индекс [currency, date DESC] покрывает этот запрос
    const nearest = await prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { date: "desc" },
    })
    if (nearest) return nearest.rate
    throw new Error("RATE_UNAVAILABLE")
  }
}

// Пересчёт суммы (в копейках исходной валюты) в рубли (копейки)
export async function convertToRub(
  amount: number,
  currency: string,
  date: Date
): Promise<number> {
  const rate = await getRateToRub(currency, date)
  return Math.round(amount * rate)
}

// Пересчёт между любыми валютами через рубль (кросс-курс ЦБ на дату)
export async function convertBetween(
  amount: number,
  from: string,
  to: string,
  date: Date
): Promise<number> {
  if (from === to) return amount
  const [rateFrom, rateTo] = await Promise.all([
    getRateToRub(from, date),
    getRateToRub(to, date),
  ])
  return Math.round((amount * rateFrom) / rateTo)
}
