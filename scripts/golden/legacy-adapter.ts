import authConfig from "@/lib/auth.config"
import { evaluateAchievements, type AchievementMetrics } from "@/lib/achievements"
import { handleServiceError } from "@/lib/api-errors"
import { buildProfileStatistics, type UserMoneyStatistics } from "@/lib/statistics"
import { calculateSimplifiedDebts } from "@/lib/utils/balance-calculator"
import { parseCalendarDate } from "@/lib/utils/calendar-date"
import {
  calculateSplits,
  type SplitParticipant,
} from "@/lib/utils/split-calculator"
import { isPasswordWithinBcryptLimit } from "@/lib/validations/auth"
import { registrationSchema } from "@/lib/validations/auth"
import { createExpenseSchema } from "@/lib/validations/expense"
import { createGroupSchema, updateGroupSchema } from "@/lib/validations/group"
import { createSettlementSchema } from "@/lib/validations/settlement"
import type { GoldenAdapter, GoldenOutcome, GoldenRequest, JsonValue } from "./types"

const MAX_DATABASE_INT = 2_147_483_647

type JsonObject = { [key: string]: JsonValue }

function object(value: JsonValue, context: string): JsonObject {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_GOLDEN_INPUT:${context}`)
  }
  return value
}

function array(value: JsonValue | undefined, context: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`INVALID_GOLDEN_INPUT:${context}`)
  return value
}

function string(value: JsonValue | undefined, context: string): string {
  if (typeof value !== "string") throw new Error(`INVALID_GOLDEN_INPUT:${context}`)
  return value
}

function number(value: JsonValue | undefined, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`INVALID_GOLDEN_INPUT:${context}`)
  }
  return value
}

function boolean(value: JsonValue | undefined, context: string): boolean {
  if (typeof value !== "boolean") throw new Error(`INVALID_GOLDEN_INPUT:${context}`)
  return value
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function toDatabaseInt(value: number): number {
  const rounded = Math.round(value)
  if (!Number.isSafeInteger(rounded) || rounded < 0 || rounded > MAX_DATABASE_INT) {
    throw new Error("CONVERTED_AMOUNT_TOO_LARGE")
  }
  return rounded
}

function toPositiveDatabaseInt(value: number): number {
  const rounded = toDatabaseInt(value)
  if (rounded === 0) throw new Error("CONVERTED_AMOUNT_TOO_SMALL")
  return rounded
}

function splitParticipants(value: JsonValue | undefined): SplitParticipant[] {
  return array(value, "participants").map((item, index) => {
    const participant = object(item, `participants[${index}]`)
    const userId = string(participant.userId, `participants[${index}].userId`)
    if (typeof participant.amount === "number") return { userId, amount: participant.amount }
    if (typeof participant.percentage === "number") {
      return { userId, percentage: participant.percentage }
    }
    return { userId }
  })
}

function calculateConvertedExpense(input: JsonObject): JsonValue {
  const amount = number(input.amount, "amount")
  const factor = number(input.factor, "factor")
  const splitType = string(input.splitType, "splitType") as "EQUAL" | "EXACT" | "PERCENTAGE"
  const splits = calculateSplits(amount, splitType, splitParticipants(input.participants))
  const amountBase = toPositiveDatabaseInt(amount * factor)
  const converted = splits.map((split, index) => {
    const exactAmountBase = split.amount * factor
    toDatabaseInt(exactAmountBase)
    const floorAmountBase = Math.floor(exactAmountBase)
    return {
      index,
      floorAmountBase,
      fraction: exactAmountBase - floorAmountBase,
    }
  })
  const allocated = converted.map((split) => split.floorAmountBase)
  const remainder = amountBase - allocated.reduce((sum, value) => sum + value, 0)
  if (remainder < 0 || remainder > converted.length) throw new Error("SPLIT_TOTAL_MISMATCH")

  const allocationOrder = [...converted].sort(
    (left, right) => right.fraction - left.fraction || left.index - right.index
  )
  for (let index = 0; index < remainder; index += 1) {
    allocated[allocationOrder[index].index] += 1
  }
  if (splits.some((split, index) => split.amount > 0 && allocated[index] === 0)) {
    throw new Error("CONVERTED_AMOUNT_TOO_SMALL")
  }

  return {
    amount,
    amountBase,
    splits: splits.map((split, index) => ({
      userId: split.userId,
      amount: split.amount,
      amountBase: allocated[index],
    })),
  }
}

function validationOutcome(success: boolean, issues: Array<{ path: PropertyKey[] }> = []): JsonValue {
  return {
    accepted: success,
    fields: [...new Set(issues.map((issue) => String(issue.path[0] ?? "root")))].sort(),
  }
}

function parsedValidationOutcome(
  result: { success: true; data: unknown } | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } },
  project: (value: unknown) => unknown = (value) => value
): JsonValue {
  if (!result.success) return validationOutcome(false, result.error.issues)
  return { accepted: true, fields: [], value: json(project(result.data)) }
}

function validateRegistration(input: JsonObject): JsonValue {
  return parsedValidationOutcome(registrationSchema.safeParse(input), (value) => {
    const registration = value as { email: string; name: string; password: string }
    return {
      email: registration.email,
      name: registration.name,
      passwordBytes: new TextEncoder().encode(registration.password).byteLength,
    }
  })
}

function rate(rates: JsonObject, currency: string): number {
  if (currency === "RUB") return 1
  return number(rates[currency], `rates.${currency}`)
}

function convertBetween(input: JsonObject): JsonValue {
  const amount = number(input.amount, "amount")
  const from = string(input.from, "from")
  const to = string(input.to, "to")
  if (from === to) return { converted: amount }
  const rates = object(input.rates ?? null, "rates")
  return { converted: Math.round((amount * rate(rates, from)) / rate(rates, to)) }
}

function currencyPolicy(input: JsonObject): JsonValue {
  return {
    currency: string(input.currency, "currency"),
    scale: 2,
    inputMinimum: 1,
    inputMaximum: 2_000_000_000,
    storage: "INT32",
  }
}

function ledgerMutationPolicy(input: JsonObject): JsonValue {
  const command = string(input.command, "command")
  switch (command) {
    case "EXPENSE_EDIT":
      return {
        command,
        aggregateIdentity: "STABLE",
        history: "MUTABLE_FACTS",
        financialEffect: "REPLACE_CURRENT_ROWS",
      }
    case "EXPENSE_DELETE":
      return {
        command,
        aggregateIdentity: "REMOVED",
        history: "PARTIALLY_RETAINED_FACTS",
        financialEffect: "CASCADE_DELETE",
      }
    case "SETTLEMENT_RESET":
      return {
        command,
        aggregateIdentity: "REMOVED",
        history: "RETAINED_FACTS",
        financialEffect: "DELETE_MANUAL_ONLY",
      }
    default:
      throw new Error("UNSUPPORTED_LEDGER_COMMAND")
  }
}

function selectNearestRate(input: JsonObject): JsonValue {
  const requestedDate = Date.parse(`${string(input.requestedDate, "requestedDate")}T00:00:00.000Z`)
  const rates = array(input.rates, "rates").map((item, index) => {
    const candidate = object(item, `rates[${index}]`)
    const date = string(candidate.date, `rates[${index}].date`)
    return {
      date,
      timestamp: Date.parse(`${date}T00:00:00.000Z`),
      rate: number(candidate.rate, `rates[${index}].rate`),
    }
  })
  const before = rates
    .filter((candidate) => candidate.timestamp <= requestedDate)
    .sort((left, right) => right.timestamp - left.timestamp)[0]
  const after = rates
    .filter((candidate) => candidate.timestamp >= requestedDate)
    .sort((left, right) => left.timestamp - right.timestamp)[0]

  if (!before && !after) throw new Error("RATE_UNAVAILABLE")
  if (!before) return { rate: after!.rate }
  if (!after) return { rate: before.rate }
  return {
    rate:
      requestedDate - before.timestamp <= after.timestamp - requestedDate
        ? before.rate
        : after.rate,
  }
}

function evaluateBusinessDate(input: JsonObject): JsonValue {
  const date = string(input.value, "value")
  parseCalendarDate(date)
  const instant = new Date(string(input.now, "now"))
  if (Number.isNaN(instant.getTime())) throw new Error("INVALID_INSTANT")
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: string(input.zoneId, "zoneId"),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    throw new Error("INVALID_ZONE_ID")
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value])
  )
  const today = `${parts.year}-${parts.month}-${parts.day}`
  return { date, today, future: date > today }
}

function calculateBalance(input: JsonObject): JsonValue {
  const expenses = array(input.expenses, "expenses").map((item, expenseIndex) => {
    const expense = object(item, `expenses[${expenseIndex}]`)
    return {
      paidById: string(expense.paidById, `expenses[${expenseIndex}].paidById`),
      splits: array(expense.splits, `expenses[${expenseIndex}].splits`).map(
        (splitItem, splitIndex) => {
          const split = object(splitItem, `expenses[${expenseIndex}].splits[${splitIndex}]`)
          return {
            userId: string(split.userId, "split.userId"),
            amount: number(split.amount, "split.amount"),
          }
        }
      ),
    }
  })
  const settlements = array(input.settlements, "settlements").map((item, index) => {
    const settlement = object(item, `settlements[${index}]`)
    return {
      fromUserId: string(settlement.fromUserId, "settlement.fromUserId"),
      toUserId: string(settlement.toUserId, "settlement.toUserId"),
      amount: number(settlement.amount, "settlement.amount"),
    }
  })
  const names = object(input.userNames ?? null, "userNames")
  return json(
    calculateSimplifiedDebts(
      expenses,
      settlements,
      Object.fromEntries(Object.entries(names).map(([id, name]) => [id, string(name, `userNames.${id}`)]))
    )
  )
}

function applySettlement(input: JsonObject): JsonValue {
  const actorId = string(input.actorId, "actorId")
  const toUserId = string(input.toUserId, "toUserId")
  if (actorId === toUserId) throw new Error("SELF_SETTLEMENT")
  const activeMemberIds = new Set(array(input.activeMemberIds, "activeMemberIds").map((id) => string(id, "memberId")))
  if (!activeMemberIds.has(actorId)) throw new Error("FORBIDDEN")
  if (!activeMemberIds.has(toUserId)) throw new Error("RECIPIENT_NOT_MEMBER")
  const outstanding = number(input.outstanding, "outstanding")
  const amount = number(input.amount, "amount")
  if (outstanding <= 0) throw new Error("NO_DEBT")
  if (amount > outstanding) throw new Error("AMOUNT_EXCEEDS_DEBT")

  return {
    settlement: {
      fromUserId: actorId,
      toUserId,
      amount,
      amountBase: amount,
      currency: string(input.groupCurrency, "groupCurrency"),
      date: parseCalendarDate(string(input.date, "date")).toISOString(),
    },
    remaining: outstanding - amount,
  }
}

function leaveMembership(input: JsonObject): JsonValue {
  const actor = object(input.actor ?? null, "actor")
  const target = object(input.target ?? null, "target")
  const actorId = string(actor.id, "actor.id")
  const targetId = string(target.id, "target.id")
  const actorActive = boolean(actor.active, "actor.active")
  const targetActive = boolean(target.active, "target.active")
  const actorRole = string(actor.role, "actor.role")
  const targetRole = string(target.role, "target.role")

  if (!actorActive || (actorId !== targetId && actorRole !== "ADMIN")) throw new Error("FORBIDDEN")
  if (!targetActive) throw new Error("NOT_FOUND")
  if (actorId === targetId && targetRole === "ADMIN") throw new Error("ADMIN_CANNOT_LEAVE")
  if (number(input.targetBalance, "targetBalance") !== 0) throw new Error("MEMBER_HAS_BALANCE")
  return { userId: targetId, isActive: false }
}

function acceptInvite(input: JsonObject): JsonValue {
  if (!boolean(input.inviteExists, "inviteExists") || boolean(input.revoked, "revoked")) {
    throw new Error("INVITE_INVALID")
  }
  const groupId = string(input.groupId, "groupId")
  if (input.membership == null) {
    return {
      groupId,
      membership: { active: true, role: "MEMBER" },
      historyAdded: true,
    }
  }
  const membership = object(input.membership, "membership")
  if (boolean(membership.active, "membership.active")) {
    return {
      groupId,
      membership: {
        active: true,
        role: string(membership.role, "membership.role"),
      },
      historyAdded: false,
    }
  }
  return {
    groupId,
    membership: { active: true, role: "MEMBER" },
    historyAdded: true,
  }
}

function authorizeExpenseMutation(input: JsonObject): JsonValue {
  if (!boolean(input.actorActive, "actorActive")) throw new Error("FORBIDDEN")
  const action = string(input.action, "action")
  const actorId = string(input.actorId, "actorId")
  const createdById = string(input.createdById, "createdById")
  const paidById = string(input.paidById, "paidById")
  const actorRole = string(input.actorRole, "actorRole")
  const authorized = action === "EDIT"
    ? actorId === createdById || actorId === paidById || actorRole === "ADMIN"
    : action === "DELETE"
      ? actorId === createdById || actorRole === "ADMIN"
      : false
  if (!authorized) throw new Error("FORBIDDEN")
  if (action === "EDIT" && boolean(input.hasRequestedCashPayments, "hasRequestedCashPayments")) {
    throw new Error("CASH_PAYMENTS_CREATE_ONLY")
  }
  if (array(input.inactiveBalancesAfter, "inactiveBalancesAfter").some((value, index) =>
    number(value, `inactiveBalancesAfter[${index}]`) !== 0
  )) {
    throw new Error("INACTIVE_MEMBER_HAS_BALANCE")
  }
  return { accepted: true, action }
}

function reconcileCashOnExpenseEdit(input: JsonObject): JsonValue {
  const paidById = string(input.paidById, "paidById")
  const title = string(input.title, "title")
  const date = parseCalendarDate(string(input.date, "date")).toISOString()
  const splitAmountsBase = object(input.splitAmountsBase ?? {}, "splitAmountsBase")
  const settlements = array(input.settlements, "settlements").map((item, index) => {
    const settlement = object(item, `settlements[${index}]`)
    const fromUserId = string(settlement.fromUserId, `settlements[${index}].fromUserId`)
    const amountBase = number(settlement.amountBase, `settlements[${index}].amountBase`)
    const share = splitAmountsBase[fromUserId]
    if (fromUserId === paidById || typeof share !== "number" || amountBase > share) {
      throw new Error("CASH_PAYMENT_INVALID")
    }
    return {
      id: string(settlement.id, `settlements[${index}].id`),
      fromUserId,
      toUserId: paidById,
      amount: number(settlement.amount, `settlements[${index}].amount`),
      currency: string(settlement.currency, `settlements[${index}].currency`),
      amountBase,
      date,
      notes: `К расходу «${title}»`,
    }
  })
  return { settlements }
}

function resetSettlements(input: JsonObject): JsonValue {
  if (!boolean(input.actorActive, "actorActive") || string(input.actorRole, "actorRole") !== "ADMIN") {
    throw new Error("FORBIDDEN")
  }
  const settlements = array(input.settlements, "settlements").map((item, index) => {
    const settlement = object(item, `settlements[${index}]`)
    return {
      id: string(settlement.id, `settlements[${index}].id`),
      relatedExpenseId: settlement.relatedExpenseId == null
        ? null
        : string(settlement.relatedExpenseId, `settlements[${index}].relatedExpenseId`),
    }
  })
  if (array(input.inactiveBalancesAfter, "inactiveBalancesAfter").some((value, index) =>
    number(value, `inactiveBalancesAfter[${index}]`) !== 0
  )) {
    throw new Error("INACTIVE_MEMBER_HAS_BALANCE")
  }
  const removedIds = settlements
    .filter((settlement) => settlement.relatedExpenseId == null)
    .map((settlement) => settlement.id)
  return {
    removed: removedIds.length,
    removedIds,
    remainingIds: settlements
      .filter((settlement) => settlement.relatedExpenseId != null)
      .map((settlement) => settlement.id),
  }
}

type EffectiveMoney = {
  advancedByPayer: Map<string, number>
  attributedShare: Map<string, number>
  settledSent: Map<string, number>
  settledReceived: Map<string, number>
}

function emptyEffectiveMoney(): EffectiveMoney {
  return {
    advancedByPayer: new Map(),
    attributedShare: new Map(),
    settledSent: new Map(),
    settledReceived: new Map(),
  }
}

function addMoney(target: Map<string, number>, currency: string, amount: number): void {
  target.set(currency, (target.get(currency) ?? 0) + amount)
}

function moneyEntries(values: Map<string, number>): JsonValue[] {
  return [...values.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }))
}

function effectiveMoneyJson(value: EffectiveMoney): JsonValue {
  return {
    advancedByPayer: moneyEntries(value.advancedByPayer),
    attributedShare: moneyEntries(value.attributedShare),
    settledSent: moneyEntries(value.settledSent),
    settledReceived: moneyEntries(value.settledReceived),
  }
}

function reduceEffectiveHistory(input: JsonObject): JsonValue {
  const userId = string(input.userId, "userId")
  const current = emptyEffectiveMoney()
  const allTimeEffective = emptyEffectiveMoney()
  for (const [aggregateType, source] of [
    ["expense", array(input.expenses, "expenses")],
    ["settlement", array(input.settlements, "settlements")],
  ] as const) {
    for (const [index, item] of source.entries()) {
      const aggregate = object(item, `${aggregateType}s[${index}]`)
      const revisions = array(aggregate.revisions, `${aggregateType}s[${index}].revisions`)
        .map((revisionItem, revisionIndex) => {
          const revision = object(revisionItem, `${aggregateType}s[${index}].revisions[${revisionIndex}]`)
          return { revision, version: number(revision.version, "revision.version") }
        })
        .sort((left, right) => right.version - left.version)
      const latest = revisions[0]?.revision
      if (!latest || string(latest.status, "revision.status") === "VOID") continue
      const currency = string(latest.currency, "revision.currency")
      const groupActive = boolean(aggregate.groupActive, `${aggregateType}.groupActive`)
      const targets = groupActive ? [allTimeEffective, current] : [allTimeEffective]
      for (const target of targets) {
        if (aggregateType === "expense") {
          if (string(latest.paidById, "revision.paidById") === userId) {
            addMoney(target.advancedByPayer, currency, number(latest.amount, "revision.amount"))
          }
          const shares = object(latest.shares ?? {}, "revision.shares")
          if (typeof shares[userId] === "number") {
            addMoney(target.attributedShare, currency, number(shares[userId], `revision.shares.${userId}`))
          }
        } else {
          const amount = number(latest.amount, "revision.amount")
          if (string(latest.fromUserId, "revision.fromUserId") === userId) {
            addMoney(target.settledSent, currency, amount)
          }
          if (string(latest.toUserId, "revision.toUserId") === userId) {
            addMoney(target.settledReceived, currency, amount)
          }
        }
      }
    }
  }
  return {
    current: effectiveMoneyJson(current),
    allTimeEffective: effectiveMoneyJson(allTimeEffective),
  }
}

async function mapServiceError(input: JsonObject): Promise<JsonValue> {
  const errorValue = input.error
  const error = typeof errorValue === "string" ? new Error(errorValue) : errorValue
  const response = handleServiceError(error)
  return { status: response.status, body: json(await response.json()) }
}

async function projectAuthSession(input: JsonObject): Promise<JsonValue> {
  const jwt = authConfig.callbacks!.jwt as (args: unknown) => unknown
  const session = authConfig.callbacks!.session as (args: unknown) => unknown
  const token = await Promise.resolve(
    jwt({
      token: json(input.token ?? {}),
      ...(input.user == null ? {} : { user: json(input.user) }),
      ...(input.trigger == null ? {} : { trigger: input.trigger }),
      ...(input.sessionUpdate == null ? {} : { session: json(input.sessionUpdate) }),
    })
  )
  const projectedSession = await Promise.resolve(
    session({ session: { user: json(input.sessionUser ?? {}) }, token })
  )
  return json({ token, session: projectedSession })
}

async function executeLegacy(operation: string, input: JsonObject): Promise<JsonValue> {
  switch (operation) {
    case "expense.calculateSplits":
      return json(
        calculateSplits(
          number(input.totalAmount, "totalAmount"),
          string(input.splitType, "splitType") as "EQUAL" | "EXACT" | "PERCENTAGE",
          splitParticipants(input.participants)
        )
      )
    case "expense.convertAndAllocate":
      return calculateConvertedExpense(input)
    case "expense.validateCommand": {
      const result = createExpenseSchema.safeParse(input)
      return validationOutcome(result.success, result.success ? [] : result.error.issues)
    }
    case "expense.parseCommand":
      return parsedValidationOutcome(createExpenseSchema.safeParse(input))
    case "expense.authorizeMutation":
      return authorizeExpenseMutation(input)
    case "expense.reconcileCashOnEdit":
      return reconcileCashOnExpenseEdit(input)
    case "fx.convertBetween":
      return convertBetween(input)
    case "money.currencyPolicy":
      return currencyPolicy(input)
    case "ledger.mutationPolicy":
      return ledgerMutationPolicy(input)
    case "fx.selectNearestRate":
      return selectNearestRate(input)
    case "balance.calculate":
      return calculateBalance(input)
    case "settlement.apply":
      return applySettlement(input)
    case "settlement.validateCommand": {
      const result = createSettlementSchema.safeParse(input)
      return validationOutcome(result.success, result.success ? [] : result.error.issues)
    }
    case "settlement.parseCommand":
      return parsedValidationOutcome(createSettlementSchema.safeParse(input))
    case "settlement.reset":
      return resetSettlements(input)
    case "membership.leave":
      return leaveMembership(input)
    case "membership.acceptInvite":
      return acceptInvite(input)
    case "date.parseCalendarDate":
      return { iso: parseCalendarDate(string(input.value, "value")).toISOString() }
    case "date.evaluateBusinessDate":
      return evaluateBusinessDate(input)
    case "statistics.buildProfile":
      return json(
        buildProfileStatistics(
          input.metrics as unknown as AchievementMetrics,
          input.money as unknown as UserMoneyStatistics
        )
      )
    case "statistics.reduceEffectiveHistory":
      return reduceEffectiveHistory(input)
    case "achievements.evaluate": {
      const ids = new Set(array(input.ids, "ids").map((id) => string(id, "achievement id")))
      const persisted = new Set(
        array(input.persistedIds, "persistedIds").map((id) => string(id, "persisted id"))
      )
      return json(
        evaluateAchievements(input.metrics as unknown as AchievementMetrics, persisted).filter(
          (achievement) => ids.has(achievement.id)
        )
      )
    }
    case "auth.passwordWithinBcryptLimit":
      return { accepted: isPasswordWithinBcryptLimit(string(input.password, "password")) }
    case "auth.validateRegistration":
      return validateRegistration(input)
    case "auth.projectSession":
      return projectAuthSession(input)
    case "error.mapService":
      return mapServiceError(input)
    case "group.validateCreate":
      return parsedValidationOutcome(createGroupSchema.safeParse(input))
    case "group.validateUpdate":
      return parsedValidationOutcome(updateGroupSchema.safeParse(input))
    default:
      throw new Error(`UNSUPPORTED_GOLDEN_OPERATION:${operation}`)
  }
}

export class LegacyGoldenAdapter implements GoldenAdapter {
  readonly name = "legacy-typescript"
  readonly kind = "legacy" as const

  async execute(request: GoldenRequest): Promise<GoldenOutcome> {
    try {
      return { ok: true, value: await executeLegacy(request.operation, object(request.input, "input")) }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        },
      }
    }
  }
}
