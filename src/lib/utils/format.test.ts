import { describe, expect, it } from "vitest"
import {
  formatMoney,
  formatDate,
  formatDateTime,
  toLocalDateInputValue,
  getInitials,
  parseMoneyInput,
} from "./format"

// Убираем любые пробелы (Intl использует неразрывные) для устойчивых проверок.
const noSpace = (s: string) => s.replace(/\s/g, "")

describe("formatMoney", () => {
  // Пиним точный формат (без учёта вида пробела — Intl использует NBSP/NNBSP):
  // группировка тысяч, запятая-разделитель, символ валюты в конце.
  it("делит копейки на 100 и добавляет символ рубля по умолчанию", () => {
    expect(noSpace(formatMoney(120099))).toBe("1200,99₽")
  })

  it("целые суммы без дробной части", () => {
    expect(noSpace(formatMoney(100000))).toBe("1000₽")
  })

  it("ноль форматируется как 0 ₽", () => {
    expect(noSpace(formatMoney(0))).toBe("0₽")
  })

  it("отбрасывает лишний ноль дробной части (min 0)", () => {
    // 0,5 — не 0,50
    expect(noSpace(formatMoney(50))).toBe("0,5₽")
  })

  it("учитывает переданную валюту (не рубль)", () => {
    expect(noSpace(formatMoney(100000, "USD"))).toBe("1000$")
  })

  it("отрицательные суммы (возвраты) сохраняют знак", () => {
    expect(noSpace(formatMoney(-120099))).toBe("-1200,99₽")
  })
})

describe("formatDate / formatDateTime", () => {
  it("formatDate содержит год", () => {
    expect(formatDate(new Date(2026, 7, 1))).toContain("2026")
  })

  it("formatDate принимает строку ISO", () => {
    expect(formatDate("2026-08-01T10:00:00.000Z")).toContain("2026")
  })

  it("formatDateTime содержит время (часы:минуты)", () => {
    expect(formatDateTime(new Date(2026, 7, 1, 14, 30))).toMatch(/\d{2}:\d{2}/)
  })
})

describe("toLocalDateInputValue", () => {
  it("возвращает локальную дату YYYY-MM-DD без сдвига через UTC", () => {
    expect(toLocalDateInputValue(new Date(2026, 7, 1, 0, 30))).toBe("2026-08-01")
  })

  it("поздний вечер не перетекает на следующий день", () => {
    expect(toLocalDateInputValue(new Date(2026, 0, 15, 23, 59))).toBe("2026-01-15")
  })

  it("принимает строку", () => {
    expect(toLocalDateInputValue("2026-12-31T09:00:00")).toBe("2026-12-31")
  })

  it("без аргумента возвращает сегодняшнюю дату в формате YYYY-MM-DD", () => {
    expect(toLocalDateInputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(toLocalDateInputValue()).toBe(toLocalDateInputValue(new Date()))
  })
})

describe("getInitials", () => {
  it("две первые буквы из имени и фамилии, в верхнем регистре", () => {
    expect(getInitials("Иван Петров")).toBe("ИП")
  })

  it("одно слово → одна буква", () => {
    expect(getInitials("Мадонна")).toBe("М")
  })

  it("латиница в верхний регистр", () => {
    expect(getInitials("alice smith")).toBe("AS")
  })

  it("не больше двух букв", () => {
    expect(getInitials("a b c d")).toBe("AB")
  })

  it("пустая строка → пусто", () => {
    expect(getInitials("")).toBe("")
  })

  it("двойной пробел (пустой сегмент) не ломает результат", () => {
    // "a  b" → ["a","","b"] → ["a", undefined, "b"] → "ab" → "AB"
    expect(getInitials("a  b")).toBe("AB")
  })
})

describe("parseMoneyInput", () => {
  it("запятая как десятичный разделитель → копейки", () => {
    expect(parseMoneyInput("12,34")).toBe(1234)
  })

  it("точка как десятичный разделитель", () => {
    expect(parseMoneyInput("12.34")).toBe(1234)
  })

  it("целое число рублей", () => {
    expect(parseMoneyInput("100")).toBe(10000)
  })

  it("корректно округляет плавающую точку", () => {
    expect(parseMoneyInput("19.99")).toBe(1999)
    expect(parseMoneyInput("0.1")).toBe(10)
  })

  it("пустая строка → 0", () => {
    expect(parseMoneyInput("")).toBe(0)
    expect(parseMoneyInput("   ")).toBe(0)
  })

  it("нечисловой ввод → 0", () => {
    expect(parseMoneyInput("abc")).toBe(0)
  })

  it("ноль и отрицательные → 0", () => {
    expect(parseMoneyInput("0")).toBe(0)
    expect(parseMoneyInput("-5")).toBe(0)
  })

  it("parseFloat останавливается на пробеле: '1 000' → 1 рубль", () => {
    // фактическое поведение: parseFloat('1 000') === 1
    expect(parseMoneyInput("1 000")).toBe(100)
  })
})
