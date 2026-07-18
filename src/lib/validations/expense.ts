import { z } from "zod"

const baseSplitParticipant = z.object({ userId: z.string().min(1) })

export const createExpenseSchema = z
  .object({
    title: z.string().min(1, "Название обязательно").max(255),
    amount: z.number().int().positive("Сумма должна быть больше 0").max(2_000_000_000, "Максимальная сумма — 20 000 000 ₽"),
    currency: z.string().length(3).default("RUB"),
    category: z.string().optional(),
    date: z.string(),
    paidById: z.string().min(1, "Укажите плательщика"),
    notes: z.string().max(1000).optional(),
    splitType: z.enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]),
    splits: z.array(
      baseSplitParticipant.extend({
        amount: z.number().int().optional(),
        percentage: z.number().int().optional(),
        shares: z.number().int().optional(),
      })
    ).min(1, "Нужен хотя бы один участник"),
  })
  .superRefine((data, ctx) => {
    if (data.splitType === "EXACT") {
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
      const total = data.splits.reduce((s, p) => s + (p.percentage ?? 0), 0)
      if (total !== 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Сумма процентов должна быть 100% (сейчас ${total / 100}%)`,
          path: ["splits"],
        })
      }
    }
  })

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
