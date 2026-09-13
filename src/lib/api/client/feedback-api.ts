import type { FeedbackInput } from "@/lib/validations/feedback"
import type { FeedbackListResponseDto, FeedbackResponseDto } from "@/lib/api/v1/response-dtos"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

export const feedbackApi = {
  createFeedback: (command: FeedbackInput, options?: ApiCallOptions) =>
    apiRequest<FeedbackResponseDto>("/feedback", {
      ...options,
      method: "POST",
      body: command,
    }),
  getAdminFeedback: (options?: ApiCallOptions) =>
    apiRequest<FeedbackListResponseDto>("/admin/feedback", options),
}
