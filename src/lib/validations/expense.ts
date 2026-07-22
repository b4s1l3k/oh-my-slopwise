import { z } from "zod"
import { SUPPORTED_CURRENCIES } from "@/lib/currencies"

const splitParticipant = z.object({
  userId: z.string().min(1),
  amount: z.number().int().optional(),
  percentage: z.number().int().optional(),
  shares: z.number().int().optional(),
})

export const createExpenseSchema = z
  .object({
    title: z.string().min(1, "Название обязательно").max(255),
    amount: z
      .number()
      .int()
      .positive("Сумма должна быть больше 0")
      .max(2_000_000_000, "Максимальная сумма — 20 000 000 ₽"),
    currency: z.enum(SUPPORTED_CURRENCIES).default("RUB"),
    // Ручной курс «валюта траты → валюта расчёта» (1 ед. траты = customRate ед. расчёта).
    // Не задан → пересчёт по курсу ЦБ на дату операции.
    customRate: z.number().positive().max(1_000_000).optional(),
    category: z.string().optional(),
    date: z.string(),
    paidById: z.string().min(1, "Укажите плательщика"),
    notes: z.string().max(1000).optional(),
    splitType: z.enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]),
    splits: z.array(splitParticipant).min(1, "Нужен хотя бы один участник"),
    // Наличные, которые участники вернули плательщику на месте (атомарно создаются расчёты)
    cashPayments: z
      .array(z.object({ userId: z.string().min(1), amount: z.number().int().positive() }))
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Дубликаты участников недопустимы (иначе нарушится уникальность в БД)
    const ids = data.splits.map((s) => s.userId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Участник указан более одного раза",
        path: ["splits"],
      })
    }

    if (data.splitType === "EXACT") {
      data.splits.forEach((s, i) => {
        if (s.amount == null || s.amount <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Сумма каждого участника должна быть больше 0",
            path: ["splits", i, "amount"],
          })
        }
      })
      const total = data.splits.reduce((s, p) => s + (p.amount ?? 0), 0)
      if (total !== data.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Сумма долей (${total / 100}₽) не равна сумме расхода (${data.amount / 100}₽)`,
          path: ["splits"],
        })
      }
    }

    if (data.splitType === "PERCENTAGE") {
      data.splits.forEach((s, i) => {
        if (s.percentage == null || s.percentage <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Процент каждого участника должен быть больше 0",
            path: ["splits", i, "percentage"],
          })
        }
      })
      const total = data.splits.reduce((s, p) => s + (p.percentage ?? 0), 0)
      if (total !== 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Сумма процентов должна быть 100% (сейчас ${total / 100}%)`,
          path: ["splits"],
        })
      }
    }

    if (data.cashPayments?.some((cp) => cp.userId === data.paidById)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Плательщик расхода не может быть в списке наличных платежей",
        path: ["cashPayments"],
      })
    }
    if (data.cashPayments) {
      const totalCash = data.cashPayments.reduce((s, cp) => s + cp.amount, 0)
      if (totalCash >= data.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Сумма наличных платежей не может превышать сумму расхода",
          path: ["cashPayments"],
        })
      }
    }

    if (data.splitType === "SHARES") {
      data.splits.forEach((s, i) => {
        if (s.shares == null || s.shares <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Доля каждого участника должна быть больше 0",
            path: ["splits", i, "shares"],
          })
        }
      })
    }
  })

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
