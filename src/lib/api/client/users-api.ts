import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

export const usersApi = {
  registerUser: (
    command: ApiOperationRequest<"registerUserV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"registerUserV1", 201>>("/users/register", {
      ...options,
      method: "POST",
      body: command,
    }),
  getProfile: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getCurrentUserV1", 200>>("/users/me", options),
  updateProfile: (
    command: ApiOperationRequest<"updateCurrentUserV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"updateCurrentUserV1", 200>>("/users/me", {
      ...options,
      method: "PATCH",
      body: command,
    }),
  searchUsers: (query: string, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ q: query })
    return apiRequest<ApiOperationResponse<"searchUsersV1", 200>>(
      `/users/search?${search}`,
      options
    )
  },
  getAchievements: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getCurrentUserAchievementsV1", 200>>(
      "/users/me/achievements",
      options
    ),
  collectUnseenAchievements: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"claimCurrentUserAchievementNotificationsV1", 200>>(
      "/users/me/achievements/unseen",
      {
        ...options,
        method: "POST",
      }
    ),
  getStatistics: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getCurrentUserStatisticsV1", 200>>(
      "/users/me/statistics",
      options
    ),
}
