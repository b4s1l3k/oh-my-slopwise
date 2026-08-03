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

// Разрешаем только http(s)-ссылки — блокируем javascript:/data: и подобные
// схемы, которые могли бы привести к XSS при отрисовке аватара.
const avatarUrlSchema = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Ссылка должна начинаться с http:// или https://")
  .nullable()
  .optional()

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, "Имя обязательно").max(100).optional(),
    avatarUrl: avatarUrlSchema,
  })
  .merge(requisitesSchema)

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type RequisitesInput = z.infer<typeof requisitesSchema>
