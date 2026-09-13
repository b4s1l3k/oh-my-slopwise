import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

export const feedbackApi = {
  createFeedback: (
    command: ApiOperationRequest<"createFeedbackV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"createFeedbackV1", 201>>("/feedback", {
      ...options,
      method: "POST",
      body: command,
    }),
  getAdminFeedback: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"listAdminFeedbackV1", 200>>(
      "/admin/feedback",
      options
    ),
}
