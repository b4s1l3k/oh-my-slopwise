import type {
  AcceptInviteResponseDto,
  ActivityListResponseDto,
  GroupListResponseDto,
  GroupMemberResponseDto,
  GroupResponseDto,
  InviteInfoResponseDto,
  InviteTokenResponseDto,
  RequisitesResponseDto,
} from "@/lib/api/v1/response-dtos"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"
type CreateGroupCommand = {
  name: string
  description?: string
  type: "HOME" | "TRIP" | "COUPLE" | "OTHER"
  currency: string
  memberIds: string[]
}

type UpdateGroupCommand = {
  name?: string
  description?: string
}

type RequisitesCommand = {
  payeeName?: string | null
  bankName?: string | null
  payeeAccount?: string | null
}

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const groupsApi = {
  getGroups: (options?: ApiCallOptions) =>
    apiRequest<GroupListResponseDto>("/groups", options),
  getGroup: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<GroupResponseDto>(`/groups/${pathSegment(groupId)}`, options),
  createGroup: (command: CreateGroupCommand, options?: ApiCallOptions) =>
    apiRequest<GroupResponseDto>("/groups", { ...options, method: "POST", body: command }),
  updateGroup: (
    groupId: string,
    command: UpdateGroupCommand,
    options?: ApiCallOptions
  ) => apiRequest<GroupResponseDto>(`/groups/${pathSegment(groupId)}`, {
    ...options,
    method: "PATCH",
    body: command,
  }),
  deleteGroup: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<Record<string, never>>(`/groups/${pathSegment(groupId)}`, {
      ...options,
      method: "DELETE",
    }),
  getActivity: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ActivityListResponseDto>(`/groups/${pathSegment(groupId)}/activity`, options),
  updateRequisites: (
    groupId: string,
    command: RequisitesCommand,
    options?: ApiCallOptions
  ) => apiRequest<RequisitesResponseDto>(`/groups/${pathSegment(groupId)}/requisites`, {
    ...options,
    method: "PATCH",
    body: command,
  }),
  createInvite: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<InviteTokenResponseDto>(`/groups/${pathSegment(groupId)}/invite`, {
      ...options,
      method: "POST",
    }),
  revokeInvite: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<Record<string, never>>(`/groups/${pathSegment(groupId)}/invite`, {
      ...options,
      method: "DELETE",
    }),
  getInvite: (token: string, options?: ApiCallOptions) =>
    apiRequest<InviteInfoResponseDto>(`/invites/${pathSegment(token)}`, options),
  acceptInvite: (token: string, options?: ApiCallOptions) =>
    apiRequest<AcceptInviteResponseDto>(`/invites/${pathSegment(token)}/accept`, {
      ...options,
      method: "POST",
    }),
  addMember: (groupId: string, userId: string, options?: ApiCallOptions) =>
    apiRequest<GroupMemberResponseDto>(`/groups/${pathSegment(groupId)}/members`, {
      ...options,
      method: "POST",
      body: { userId },
    }),
  removeMember: (groupId: string, userId: string, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ userId })
    return apiRequest<Record<string, never>>(
      `/groups/${pathSegment(groupId)}/members?${search}`,
      { ...options, method: "DELETE" }
    )
  },
}
