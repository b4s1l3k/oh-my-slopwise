import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { createExpenseSchema } from "@/lib/validations/expense"
import { createGroupSchema } from "@/lib/validations/group"
import { createSettlementSchema } from "@/lib/validations/settlement"
import { updateProfileSchema } from "@/lib/validations/user"
import { calculateSimplifiedDebts } from "@/lib/utils/balance-calculator"

const repositoryRoot = join(import.meta.dirname, "../..")
const routesRoot = join(repositoryRoot, "src/app/api/v1")
const contractPath = join(import.meta.dirname, "v1.openapi.json")
const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head"] as const

type HttpMethod = (typeof httpMethods)[number]
type OpenApiOperation = {
  operationId?: string
  responses?: Record<string, unknown>
  security?: Array<Record<string, unknown>>
}
type JsonSchema = {
  $ref?: string
  type?: string | string[]
  format?: string
  pattern?: string
  minLength?: number
  required?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
}
type OpenApiDocument = {
  openapi?: string
  paths?: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>>
  components?: {
    schemas?: Record<string, JsonSchema>
  }
  [key: string]: unknown
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === "route.ts" ? [path] : []
  })
}

function routePath(file: string): string {
  const relativePath = relative(routesRoot, file).replace(/\\/g, "/")
  const segments = relativePath
    .replace(/\/route\.ts$/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/^\[([^\]]+)]$/, "{$1}"))
  return `/api/v1/${segments.join("/")}`.replace(/\/$/, "")
}

function implementedOperations(): string[] {
  const exportPattern = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g

  return routeFiles(routesRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8")
    return [...source.matchAll(exportPattern)].map(
      (match) => `${match[1].toLowerCase()} ${routePath(file)}`
    )
  })
}

function documentedOperations(document: OpenApiDocument): Array<{
  key: string
  operation: OpenApiOperation
}> {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    httpMethods.flatMap((method) => {
      const operation = pathItem[method]
      return operation ? [{ key: `${method} ${path}`, operation }] : []
    })
  )
}

function localReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(localReferences)
  if (!value || typeof value !== "object") return []

  return Object.entries(value).flatMap(([key, nested]) =>
    key === "$ref" && typeof nested === "string" && nested.startsWith("#/")
      ? [nested]
      : localReferences(nested)
  )
}

function resolveLocalReference(document: OpenApiDocument, reference: string): unknown {
  return reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") return undefined
      return (current as Record<string, unknown>)[segment]
    }, document)
}

function componentSchema(document: OpenApiDocument, name: string): JsonSchema {
  const schema = document.components?.schemas?.[name]
  if (!schema) throw new Error(`Missing OpenAPI component schema: ${name}`)
  return schema
}

describe("the canonical /api/v1 OpenAPI snapshot", () => {
  const document = JSON.parse(readFileSync(contractPath, "utf8")) as OpenApiDocument
  const documented = documentedOperations(document)

  it("is an OpenAPI 3.1 document", () => {
    expect(document.openapi).toMatch(/^3\.1\./)
  })

  it("covers every implemented route and method without phantom operations", () => {
    expect(documented.map(({ key }) => key).sort()).toEqual(implementedOperations().sort())
  })

  it("uses unique stable operation IDs", () => {
    const operationIds = documented.map(({ operation }) => operation.operationId)
    expect(operationIds.every(Boolean)).toBe(true)
    expect(new Set(operationIds).size).toBe(operationIds.length)
  })

  it("keeps registration public while other operations inherit cookie authentication", () => {
    const registration = document.paths?.["/api/v1/users/register"]?.post
    expect(registration?.security).toEqual([])

    for (const { key, operation } of documented) {
      if (key === "post /api/v1/users/register") continue
      expect(operation.security, key).toBeUndefined()
    }
  })

  it("documents at least one response for every operation", () => {
    for (const { key, operation } of documented) {
      expect(Object.keys(operation.responses ?? {}), key).not.toHaveLength(0)
    }
  })

  it("resolves every local component reference", () => {
    for (const reference of new Set(localReferences(document))) {
      expect(resolveLocalReference(document, reference), reference).toBeDefined()
    }
  })

  it("uses a strict date-only business-date boundary", () => {
    const calendarDate = "2026-09-13"
    const timestamp = "2026-09-13T23:30:00-07:00"
    expect(
      createExpenseSchema.safeParse({
        title: "Dinner",
        amount: 1_000,
        date: calendarDate,
        paidById: "payer",
        splitType: "EQUAL",
        splits: [{ userId: "payer" }],
      }).success
    ).toBe(true)
    expect(
      createExpenseSchema.safeParse({
        title: "Dinner",
        amount: 1_000,
        date: timestamp,
        paidById: "payer",
        splitType: "EQUAL",
        splits: [{ userId: "payer" }],
      }).success
    ).toBe(false)
    expect(
      createSettlementSchema.safeParse({
        groupId: "group",
        toUserId: "recipient",
        amount: 1_000,
        date: timestamp,
      }).success
    ).toBe(false)

    const dateSchema = componentSchema(document, "CalendarDate")
    expect(dateSchema.format).toBe("date")
    expect(dateSchema.pattern && new RegExp(dateSchema.pattern).test(calendarDate)).toBe(true)
    expect(dateSchema.pattern && new RegExp(dateSchema.pattern).test(timestamp)).toBe(false)
  })

  it("models the two actual group-member user projections without overlapping oneOf", () => {
    const groupMember = componentSchema(document, "GroupMember")
    expect(groupMember.properties?.user).toEqual({
      $ref: "#/components/schemas/GroupMemberUser",
    })

    const memberUser = componentSchema(document, "GroupMemberUser")
    expect(memberUser.required).toEqual(["id", "name", "avatarUrl"])
    expect(memberUser.required).not.toContain("payeeName")
    expect(memberUser.properties).toHaveProperty("payeeName")
    expect(memberUser.oneOf).toBeUndefined()
  })

  it("rejects empty member IDs at the group boundary", () => {
    expect(createGroupSchema.safeParse({ name: "Trip", memberIds: [""] }).success).toBe(false)

    const memberIds = componentSchema(document, "CreateGroupRequest").properties?.memberIds
    expect(memberIds?.items?.$ref).toBe("#/components/schemas/OpaqueId")
    expect(componentSchema(document, "OpaqueId").minLength).toBe(1)
  })

  it("keeps the case-insensitive HTTP avatar URL behavior", () => {
    const uppercaseUrl = "HTTPS://example.com/avatar.png"
    expect(updateProfileSchema.safeParse({ avatarUrl: uppercaseUrl }).success).toBe(true)

    const updateProfile = componentSchema(document, "UpdateProfileRequest")
    const avatarUrl = updateProfile.allOf
      ?.flatMap(({ properties }) => Object.entries(properties ?? {}))
      .find(([name]) => name === "avatarUrl")?.[1]
    expect(avatarUrl?.pattern && new RegExp(avatarUrl.pattern).test(uppercaseUrl)).toBe(true)
  })

  it("uses a wider wire type for computed monetary aggregates", () => {
    const aggregate = calculateSimplifiedDebts(
      [
        { paidById: "creditor", splits: [{ userId: "debtor", amount: 2_000_000_000 }] },
        { paidById: "creditor", splits: [{ userId: "debtor", amount: 2_000_000_000 }] },
      ],
      [],
      { creditor: "Creditor", debtor: "Debtor" }
    ).simplified[0].amount
    expect(aggregate).toBeGreaterThan(2_147_483_647)
    expect(componentSchema(document, "MoneyInteger").format).toBe("int32")
    expect(componentSchema(document, "AggregateMoneyInteger").format).toBe("int64")

    const userBalance = componentSchema(document, "UserBalance")
    expect(userBalance.properties?.balance?.$ref).toBe(
      "#/components/schemas/AggregateMoneyInteger"
    )
  })
})
