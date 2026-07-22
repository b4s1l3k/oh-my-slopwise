import { z } from "zod"

export const feedbackSchema = z.object({
  message: z.string().min(10, "Минимум 10 символов").max(2000, "Максимум 2000 символов"),
})

export type FeedbackInput = z.infer<typeof feedbackSchema>
