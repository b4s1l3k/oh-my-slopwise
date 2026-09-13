import { describe, expect, it } from "vitest"
import {
  documentedOpenApiRequestOperationIds,
  validateOpenApiRequest,
  validateOpenApiResponse,
} from "./openapi-test-validator"

const validExpenseCommand = {
  title: "Dinner",
  amount: 10_001,
  currency: "USD",
  customRate: 92.3456,
  category: "food",
  date: "2026-09-13",
  paidById: "payer",
  notes: "Shared dinner",
  splitType: "EXACT",
  splits: [
    { userId: "payer", amount: 5_001 },
    { userId: "member", amount: 5_000 },
  ],
  cashPayments: [{ userId: "member", amount: 100 }],
}

const requestExamples: Array<[string, Record<string, unknown>]> = [
  [
    "createGroupV1",
    {
      name: "Trip",
      description: "Weekend",
      type: "TRIP",
      currency: "RUB",
      memberIds: ["member"],
    },
  ],
  ["updateGroupV1", { name: "Renamed", description: "Updated" }],
  ["createExpenseV1", validExpenseCommand],
  ["updateExpenseV1", validExpenseCommand],
  ["addGroupMemberV1", { userId: "member" }],
  ["updateGroupRequisitesV1", { payeeName: "Alice", bankName: null, payeeAccount: "40817" }],
  [
    "createSettlementV1",
    {
      groupId: "group",
      toUserId: "recipient",
      amount: 5_000,
      currency: "RUB",
      date: "2026-09-13",
      notes: "Transfer",
    },
  ],
  ["updateCurrentUserV1", { name: "Alice", avatarUrl: "HTTPS://example.com/avatar.png" }],
  ["createFeedbackV1", { message: "A precise feedback message" }],
  ["registerUserV1", { email: "new@example.com", name: "New User", password: "safe-password" }],
]

function expectValid(result: ReturnType<typeof validateOpenApiRequest>): void {
  expect(result).toEqual({ valid: true, errors: [] })
}

function expectInvalid(result: ReturnType<typeof validateOpenApiRequest>): void {
  expect(result.valid).toBe(false)
  expect(result.errors).not.toHaveLength(0)
}

describe("OpenAPI request JSON Schema", () => {
  it("has a canonical example for every operation with a JSON request body", () => {
    expect(requestExamples.map(([operationId]) => operationId).sort()).toEqual(
      documentedOpenApiRequestOperationIds()
    )
  })

  it.each(requestExamples)("accepts the canonical %s request", (operationId, body) => {
    expectValid(validateOpenApiRequest(operationId, body))
  })

  it.each(requestExamples)("accepts fields that the v1 transport strips in %s", (operationId, body) => {
    expectValid(validateOpenApiRequest(operationId, { ...body, persistenceOnly: true }))
  })

  it("pins required fields, enums, scalar types and integer money", () => {
    expectInvalid(validateOpenApiRequest("createGroupV1", { name: "Trip", type: "UNKNOWN" }))
    expectInvalid(validateOpenApiRequest("createGroupV1", { name: "Trip", memberIds: [""] }))
    expectInvalid(validateOpenApiRequest("createExpenseV1", { ...validExpenseCommand, amount: 1.5 }))
    expectInvalid(validateOpenApiRequest("createExpenseV1", { ...validExpenseCommand, amount: 0 }))
    expectInvalid(validateOpenApiRequest("createExpenseV1", { ...validExpenseCommand, amount: 2_000_000_001 }))
    expectInvalid(validateOpenApiRequest("createExpenseV1", { ...validExpenseCommand, splitType: "CUSTOM" }))
    expectInvalid(validateOpenApiRequest("createSettlementV1", { groupId: "group" }))
  })

  it("distinguishes calendar dates from timestamps and rejects impossible dates", () => {
    expectInvalid(validateOpenApiRequest("createExpenseV1", {
      ...validExpenseCommand,
      date: "2026-09-13T00:00:00.000Z",
    }))
    expectInvalid(validateOpenApiRequest("createExpenseV1", {
      ...validExpenseCommand,
      date: "2026-02-30",
    }))
    expectInvalid(validateOpenApiRequest("createSettlementV1", {
      groupId: "group",
      toUserId: "recipient",
      amount: 1,
      date: "13.09.2026",
    }))
  })

  it("enforces the bcrypt password limit in UTF-8 bytes, not JavaScript characters", () => {
    expectValid(validateOpenApiRequest("registerUserV1", {
      email: "new@example.com",
      name: "New User",
      password: "я".repeat(36),
    }))
    expectInvalid(validateOpenApiRequest("registerUserV1", {
      email: "new@example.com",
      name: "New User",
      password: "я".repeat(37),
    }))
  })
})

describe("OpenAPI response JSON Schema", () => {
  it("accepts nullable fields and rejects missing required fields", () => {
    expect(validateOpenApiResponse("getCurrentUserV1", 200, { user: null })).toEqual({
      valid: true,
      errors: [],
    })
    expectInvalid(validateOpenApiResponse("getCurrentUserV1", 200, {}))
  })

  it("rejects undeclared persistence fields at every response depth", () => {
    expectInvalid(validateOpenApiResponse("searchUsersV1", 200, {
      users: [{ id: "user", name: "Alice", avatarUrl: null, passwordHash: "leak" }],
    }))
    expectInvalid(validateOpenApiResponse("searchUsersV1", 200, {
      users: [],
      persistenceOnly: true,
    }))
  })

  it("validates timestamp calendar correctness and int32/int64 wire boundaries", () => {
    const validProfile = {
      user: {
        id: "user",
        email: "alice@example.com",
        name: "Alice",
        avatarUrl: null,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
        createdAt: "2026-02-28T23:59:59.999Z",
      },
    }
    expectValid(validateOpenApiResponse("getCurrentUserV1", 200, validProfile))
    expectInvalid(validateOpenApiResponse("getCurrentUserV1", 200, {
      user: { ...validProfile.user, createdAt: "2026-02-30T00:00:00.000Z" },
    }))

    const balances = (amount: number) => ({
      balances: {
        simplified: [{
          fromUserId: "from",
          fromUserName: "From",
          toUserId: "to",
          toUserName: "To",
          amount,
        }],
        raw: [{ userId: "from", userName: "From", balance: -amount }],
      },
    })
    expectValid(validateOpenApiResponse("getGroupBalancesV1", 200, balances(4_000_000_000)))
    expectInvalid(validateOpenApiResponse(
      "getGroupBalancesV1",
      200,
      balances(Number.MAX_SAFE_INTEGER + 1)
    ))
  })
})
