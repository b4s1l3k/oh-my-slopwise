import type {
  AchievementCollectionResponseDto,
  AchievementUnlocksResponseDto,
  ProfileResponseDto,
  ProfileStatisticsResponseDto,
  RegisterUserResponseDto,
  UserSearchResponseDto,
} from "@/lib/api/v1/response-dtos"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"
import type { UpdateProfileInput } from "@/lib/validations/user"

type RegisterUserCommand = {
  name: string
  email: string
  password: string
}

export const usersApi = {
  registerUser: (command: RegisterUserCommand, options?: ApiCallOptions) =>
    apiRequest<RegisterUserResponseDto>("/users/register", {
      ...options,
      method: "POST",
      body: command,
    }),
  getProfile: (options?: ApiCallOptions) =>
    apiRequest<ProfileResponseDto>("/users/me", options),
  updateProfile: (command: UpdateProfileInput, options?: ApiCallOptions) =>
    apiRequest<ProfileResponseDto>("/users/me", {
      ...options,
      method: "PATCH",
      body: command,
    }),
  searchUsers: (query: string, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ q: query })
    return apiRequest<UserSearchResponseDto>(`/users/search?${search}`, options)
  },
  getAchievements: (options?: ApiCallOptions) =>
    apiRequest<AchievementCollectionResponseDto>("/users/me/achievements", options),
  collectUnseenAchievements: (options?: ApiCallOptions) =>
    apiRequest<AchievementUnlocksResponseDto>("/users/me/achievements/unseen", {
      ...options,
      method: "POST",
    }),
  getStatistics: (options?: ApiCallOptions) =>
    apiRequest<ProfileStatisticsResponseDto>("/users/me/statistics", options),
}
