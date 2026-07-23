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
    message: "Сначала завершите все расчёты в группе (баланс должен быть нулевым)",
  },
  MEMBER_HAS_BALANCE: {
    status: 409,
    message: "У участника ненулевой баланс — сначала рассчитайтесь",
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
