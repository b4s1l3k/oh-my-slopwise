import { describe, it, expect } from "vitest"
import { handleServiceError } from "./api-errors"

// Спецификация маппинга доменных кодов ошибок сервисов → HTTP-ответы.
// Таблица ниже — это и есть контракт: каждый известный код даёт свой статус и
// ТОЧНОЕ русское сообщение в теле { error: { code, message } }. Переписывая на
// другой стек, воспроизведите статус и текст дословно.
const CASES: Array<[code: string, status: number, message: string]> = [
  ["FORBIDDEN", 403, "Недостаточно прав"],
  ["NOT_FOUND", 404, "Не найдено"],
  ["USER_NOT_FOUND", 404, "Пользователь не найден"],
  ["PAYER_NOT_MEMBER", 422, "Плательщик не состоит в группе"],
  ["SPLIT_USER_NOT_MEMBER", 422, "Один из участников не состоит в группе"],
  ["SELF_SETTLEMENT", 422, "Нельзя рассчитаться с самим собой"],
  ["RECIPIENT_NOT_MEMBER", 422, "Получатель не состоит в группе"],
  ["NO_DEBT", 422, "Перед этим участником нет долга"],
  ["AMOUNT_EXCEEDS_DEBT", 422, "Сумма больше вашего долга"],
  ["GROUP_HAS_BALANCES", 409, "Сначала завершите все расчёты: в группе не должно остаться долгов"],
  ["MEMBER_HAS_BALANCE", 409, "По этому участнику остались долги — сначала завершите расчёты"],
  ["MEMBER_ALREADY_ACTIVE", 409, "Пользователь уже состоит в группе"],
  [
    "ADMIN_CANNOT_LEAVE",
    409,
    "Администратор не может выйти из группы — удалите группу после завершения расчётов",
  ],
  ["CASH_PAYMENT_INVALID", 422, "Наличный платёж должен относиться к участнику и не превышать его долю"],
  ["CASH_PAYMENTS_CREATE_ONLY", 422, "Наличные можно указать только при создании расхода"],
  ["CONVERTED_AMOUNT_TOO_LARGE", 422, "Сумма после пересчёта слишком велика — проверьте валюту и курс"],
  ["INVITE_INVALID", 404, "Приглашение недействительно или отозвано"],
  ["RATE_UNAVAILABLE", 503, "Курс ЦБ временно недоступен — укажите курс вручную"],
]

describe("handleServiceError", () => {
  it.each(CASES)("код %s → статус %i и точное сообщение", async (code, status, message) => {
    const res = handleServiceError(new Error(code))
    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.error.code).toBe(code)
    expect(body.error.message).toBe(message)
  })

  it("неизвестный код → 500 с общим сообщением, без code", async () => {
    const res = handleServiceError(new Error("SOME_UNKNOWN"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBeUndefined()
    expect(body.error.message).toBe("Внутренняя ошибка")
  })

  it("не-Error значение → 500", async () => {
    expect(handleServiceError("строка").status).toBe(500)
    expect(handleServiceError(null).status).toBe(500)
    expect(handleServiceError(undefined).status).toBe(500)
    expect(handleServiceError({ message: "x" }).status).toBe(500)
  })

  it("сообщения всех кодов различны (нет случайных дублей при копипасте)", () => {
    const messages = CASES.map(([, , message]) => message)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it("контракт фиксирует 18 доменных кодов (изменение набора — осознанное)", () => {
    // Пин размера контракта: добавление/удаление кода в таблице обязано менять
    // это число, чтобы правка была заметна в ревью. (Это НЕ авто-сверка с
    // ERROR_MAP — он приватный; таблица CASES здесь и есть источник истины спеки.)
    expect(CASES.length).toBe(18)
  })
})
