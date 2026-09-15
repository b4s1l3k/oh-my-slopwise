/**
 * TypeScript facade for the language-neutral v1 OpenAPI contract.
 *
 * Shapes come exclusively from the generated file. Keep application code on
 * the named aliases below so regenerating the contract produces useful
 * compile-time failures without leaking openapi-typescript internals through
 * the web application.
 */
import type {
  components,
  operations,
} from "../generated/typescript/v1.generated"

type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name]
type OperationId = keyof operations
type OperationResponses<Id extends OperationId> = operations[Id] extends {
  responses: infer Responses
} ? Responses : never

export type ApiOperationRequest<Id extends OperationId> = operations[Id] extends {
  requestBody: { content: { "application/json": infer Body } }
} ? Body : never

export type ApiOperationResponse<
  Id extends OperationId,
  Status extends keyof OperationResponses<Id>,
> = OperationResponses<Id>[Status] extends {
  content: { "application/json": infer Body }
} ? Body : never

export type CurrencyDto = Schema<"Currency">
export type UserSummaryDto = Schema<"UserSummary">
export type UserNameDto = Schema<"UserName">
export type GroupMemberUserDto = Schema<"GroupMemberUser">
export type ProfileDto = Schema<"Profile">
export type RegisteredUserDto = Schema<"PublicRegisteredUser">
export type GroupMemberDto = Schema<"GroupMember">
export type GroupDto = Schema<"Group">
export type ExpenseSplitDto = Schema<"ExpenseSplit">
export type ExpenseCashSettlementDto = Schema<"ExpenseCashSettlement">
export type ExpenseDto = Schema<"Expense">
export type SettlementDto = Schema<"Settlement">
export type ActivityDto = Schema<"Activity">
export type AccountActivityDto = Schema<"AccountActivity">
export type FeedbackDto = Schema<"Feedback">
export type SimplifiedDebtDto = Schema<"SimplifiedDebt">
export type UserBalanceDto = Schema<"UserBalance">
export type GroupBalancesDto = Schema<"GroupBalances">
export type FriendBalanceDto = Schema<"FriendBalance">
export type BalanceOverviewDto = Schema<"BalanceOverview">
export type InviteInfoDto = Schema<"InviteInfoResponse">["invite"]
export type RequisitesDto = Schema<"RequisitesResponse">["requisites"]
export type AchievementDto = Schema<"Achievement">
export type AchievementUnlockDto = Schema<"AchievementUnlock">
export type ProfileStatisticsDto = Schema<"ProfileStatisticsResponse">["statistics"]

export type GroupListResponseDto = Schema<"GroupListResponse">
export type GroupResponseDto = Schema<"GroupResponse">
export type GroupMemberResponseDto = Schema<"GroupMemberResponse">
export type ExpenseResponseDto = Schema<"ExpenseResponse">
export type ExpensePageResponseDto = Schema<"ExpensePageResponse">
export type GroupBalancesResponseDto = Schema<"GroupBalancesResponse">
export type SettlementResponseDto = Schema<"SettlementResponse">
export type SettlementListResponseDto = Schema<"SettlementListResponse">
export type ResetSettlementsResponseDto = Schema<"ResetSettlementsResponse">
export type InviteTokenResponseDto = Schema<"InviteTokenResponse">
export type InviteInfoResponseDto = Schema<"InviteInfoResponse">
export type AcceptInviteResponseDto = Schema<"AcceptInviteResponse">
export type RequisitesResponseDto = Schema<"RequisitesResponse">
export type ActivityListResponseDto = Schema<"ActivityListResponse">
export type AccountActivityPageResponseDto = Schema<"AccountActivityPageResponse">
export type FeedbackResponseDto = Schema<"FeedbackResponse">
export type FeedbackListResponseDto = Schema<"FeedbackListResponse">
export type ProfileResponseDto = Schema<"ProfileResponse">
export type RegisterUserResponseDto = Schema<"RegisterUserResponse">
export type AuthenticateCredentialsResponseDto = Schema<"AuthenticateCredentialsResponse">
export type UserSearchResponseDto = Schema<"UserSearchResponse">
export type AchievementCollectionResponseDto = Schema<"AchievementCollection">
export type AchievementUnlocksResponseDto = Schema<"AchievementUnlocksResponse">
export type ProfileStatisticsResponseDto = Schema<"ProfileStatisticsResponse">
