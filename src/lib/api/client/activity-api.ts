import type { ApiOperationResponse } from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

export const activityApi = {
  getActivity: (
    cursor?: string | null,
    limit?: number,
    options?: ApiCallOptions
  ) => {
    const search = new URLSearchParams()
    if (cursor != null) search.set("cursor", cursor)
    if (limit != null) search.set("limit", String(limit))
    const query = search.size > 0 ? `?${search}` : ""

    return apiRequest<ApiOperationResponse<"listAccountActivityV1", 200>>(
      `/activity${query}`,
      options
    )
  },
}
