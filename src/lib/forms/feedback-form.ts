import { z } from "zod"
import type { ApiOperationRequest } from "@contract/v1"

export const feedbackFormSchema: z.ZodType<
  ApiOperationRequest<"createFeedbackV1">
> = z.object({
  message: z
    .string()
    .trim()
    .min(10, "Минимум 10 символов")
    .max(2000, "Максимум 2000 символов"),
})

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>
