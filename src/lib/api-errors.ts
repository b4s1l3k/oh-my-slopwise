import { NextResponse } from "next/server"

// Единый маппинг доменных ошибок сервисов в HTTP-ответы
const ERROR_MAP: Record<string, { status: number; message: string }> = {
  FORBIDDEN: { status: 403, message: "Недостаточно прав" },
  NOT_FOUND: { status: 404, message: "Не найдено" },
  USER_NOT_FOUND: { status: 404, message: "Пользователь не найден" },
  PAYER_NOT_MEMBER: { status: 422, message: "Плательщик не состоит в группе" },
  SPLIT_USER_NOT_MEMBER: { status: 422, message: "Один из участников не состоит в группе" },
  SELF_SETTLEMENT: { status: 422, message: "Нельзя рассчитаться с самим собой" },
  RECIPIENT_NOT_MEMBER: { status: 422, message: "Получатель не состоит в группе" },
  NO_DEBT: { status: 422, message: "Перед этим участником нет долга" },
  AMOUNT_EXCEEDS_DEBT: { status: 422, message: "Сумма больше вашего долга" },
  GROUP_HAS_BALANCES: {
    status: 409,
    message: "Сначала завершите все расчёты: в группе не должно остаться долгов",
  },
  MEMBER_HAS_BALANCE: {
    status: 409,
    message: "По этому участнику остались долги — сначала завершите расчёты",
  },
  INACTIVE_MEMBER_HAS_BALANCE: {
    status: 409,
    message: "Изменение вернёт долг вышедшему участнику — сначала верните его в группу",
  },
  MEMBER_ALREADY_ACTIVE: {
    status: 409,
    message: "Пользователь уже состоит в группе",
  },
  GROUP_MEMBER_LIMIT: {
    status: 409,
    message: "В группе уже максимальное число участников",
  },
  ADMIN_CANNOT_LEAVE: {
    status: 409,
    message: "Администратор не может выйти из группы — удалите группу после завершения расчётов",
  },
  CASH_PAYMENT_INVALID: {
    status: 422,
    message: "Наличный платёж должен относиться к участнику и не превышать его долю",
  },
  CASH_PAYMENTS_CREATE_ONLY: {
    status: 422,
    message: "Наличные можно указать только при создании расхода",
  },
  CONVERTED_AMOUNT_TOO_LARGE: {
    status: 422,
    message: "Сумма после пересчёта слишком велика — проверьте валюту и курс",
  },
  CONVERTED_AMOUNT_TOO_SMALL: {
    status: 422,
    message: "Сумма после пересчёта меньше минимальной единицы валюты группы",
  },
  INVALID_CURSOR: { status: 400, message: "Некорректный курсор пагинации" },
  INVALID_PAGE_SIZE: { status: 400, message: "Некорректный размер страницы" },
  INVALID_IDEMPOTENCY_KEY: {
    status: 400,
    message: "Idempotency-Key должен содержать от 8 до 128 латинских букв, цифр или символов . _ : -",
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    message: "Этот Idempotency-Key уже использован с другим запросом",
  },
  IDEMPOTENCY_RESULT_UNAVAILABLE: {
    status: 409,
    message: "Результат исходного запроса больше недоступен",
  },
  TRANSACTION_CONFLICT: {
    status: 409,
    message: "Данные изменились одновременно — повторите действие",
  },
  INVITE_INVALID: { status: 404, message: "Приглашение недействительно или отозвано" },
  RATE_UNAVAILABLE: { status: 503, message: "Курс ЦБ временно недоступен — укажите курс вручную" },
}

export function handleServiceError(e: unknown): NextResponse {
  const code = e instanceof Error ? e.message : ""
  const mapped = ERROR_MAP[code]
  if (mapped) {
    return NextResponse.json(
      { error: { code, message: mapped.message } },
      { status: mapped.status }
    )
  }
  return NextResponse.json({ error: { message: "Внутренняя ошибка" } }, { status: 500 })
}
