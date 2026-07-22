import { z } from "zod"

export const createSettlementSchema = z.object({
  groupId: z.string().min(1, "Укажите группу"),
  toUserId: z.string().min(1, "Укажите получателя"),
  amount: z.number().int().positive("Сумма должна быть больше 0"),
  currency: z.string().length(3).default("RUB"),
  date: z.string(),
  notes: z.string().max(500).optional(),
})

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>
