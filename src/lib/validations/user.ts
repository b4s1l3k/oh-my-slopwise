import { z } from "zod"

// Пустая строка → null (чтобы очищать реквизиты)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .nullable()
    .optional()

export const requisitesSchema = z.object({
  payeeName: optionalText(200),
  bankName: optionalText(100),
  payeeAccount: optionalText(100),
})

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, "Имя обязательно").max(100).optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .merge(requisitesSchema)

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type RequisitesInput = z.infer<typeof requisitesSchema>
