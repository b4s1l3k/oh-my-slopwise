import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const groupsApi = {
  getGroups: (cursor?: string | null, options?: ApiCallOptions) => {
    const search = new URLSearchParams()
    if (cursor != null) search.set("cursor", cursor)
    const query = search.size > 0 ? `?${search}` : ""
    return apiRequest<ApiOperationResponse<"listGroupsV1", 200>>(
      `/groups${query}`,
      options
    )
  },
  getGroup: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getGroupV1", 200>>(
      `/groups/${pathSegment(groupId)}`,
      options
    ),
  createGroup: (
    command: ApiOperationRequest<"createGroupV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"createGroupV1", 201>>("/groups", {
      ...options,
      method: "POST",
      body: command,
    }),
  updateGroup: (
    groupId: string,
    command: ApiOperationRequest<"updateGroupV1">,
    options?: ApiCallOptions
  ) => apiRequest<ApiOperationResponse<"updateGroupV1", 200>>(
    `/groups/${pathSegment(groupId)}`,
    {
      ...options,
      method: "PATCH",
      body: command,
    }
  ),
  deleteGroup: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"deleteGroupV1", 200>>(
      `/groups/${pathSegment(groupId)}`,
      {
        ...options,
        method: "DELETE",
      }
    ),
  updateRequisites: (
    groupId: string,
    command: ApiOperationRequest<"updateGroupRequisitesV1">,
    options?: ApiCallOptions
  ) => apiRequest<ApiOperationResponse<"updateGroupRequisitesV1", 200>>(
    `/groups/${pathSegment(groupId)}/requisites`,
    { ...options, method: "PATCH", body: command }
  ),
  createInvite: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getOrCreateGroupInviteV1", 200>>(
      `/groups/${pathSegment(groupId)}/invite`,
      { ...options, method: "POST" }
    ),
  revokeInvite: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"revokeGroupInviteV1", 200>>(
      `/groups/${pathSegment(groupId)}/invite`,
      { ...options, method: "DELETE" }
    ),
  getInvite: (token: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getInviteV1", 200>>(
      `/invites/${pathSegment(token)}`,
      options
    ),
  acceptInvite: (token: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"acceptInviteV1", 200>>(
      `/invites/${pathSegment(token)}/accept`,
      { ...options, method: "POST" }
    ),
  addMember: (
    groupId: string,
    userId: ApiOperationRequest<"addGroupMemberV1">["userId"],
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"addGroupMemberV1", 201>>(
      `/groups/${pathSegment(groupId)}/members`,
      { ...options, method: "POST", body: { userId } }
    ),
  removeMember: (groupId: string, userId: string, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ userId })
    return apiRequest<ApiOperationResponse<"removeGroupMemberV1", 200>>(
      `/groups/${pathSegment(groupId)}/members?${search}`,
      { ...options, method: "DELETE" }
    )
  },
}
