import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { AnySchema } from "ajv"
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js"
import addFormats from "ajv-formats"

type JsonObject = Record<string, unknown>

type OpenApiOperation = {
  operationId?: string
  requestBody?: unknown
  responses?: Record<string, unknown>
}

type OpenApiDocument = JsonObject & {
  paths?: Record<string, Record<string, unknown>>
}

export type SchemaValidationResult = {
  valid: boolean
  errors: ErrorObject[]
}

const contractPath = join(process.cwd(), "contracts/openapi/v1.openapi.json")
const document = JSON.parse(readFileSync(contractPath, "utf8")) as OpenApiDocument
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
})

addFormats(ajv, { mode: "full" })
ajv.addFormat("int32", {
  type: "number",
  validate: (value: number) => Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647,
})
ajv.addFormat("int64", {
  type: "number",
  validate: (value: number) => Number.isSafeInteger(value),
})
ajv.addKeyword({
  keyword: "x-maxUtf8Bytes",
  schemaType: "number",
  type: "string",
  validate: (limit: number, value: string) => Buffer.byteLength(value, "utf8") <= limit,
})

const responseValidators = new Map<string, ValidateFunction>()
const requestValidators = new Map<string, ValidateFunction>()
const validatedResponseKeys = new Set<string>()

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function resolveReference(reference: string): unknown {
  if (!reference.startsWith("#/")) {
    throw new Error(`Only local OpenAPI references are supported: ${reference}`)
  }

  return reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => {
      if (!isObject(current)) return undefined
      return current[segment]
    }, document)
}

function dereference(value: unknown, references = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((item) => dereference(item, references))
  if (!isObject(value)) return value

  const reference = value.$ref
  if (typeof reference === "string") {
    if (references.has(reference)) {
      throw new Error(`Recursive OpenAPI reference is not supported by the contract tests: ${reference}`)
    }
    const resolved = resolveReference(reference)
    if (resolved === undefined) throw new Error(`Unresolved OpenAPI reference: ${reference}`)

    const nextReferences = new Set(references).add(reference)
    const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$ref"))
    return {
      ...(dereference(resolved, nextReferences) as JsonObject),
      ...(dereference(siblings, nextReferences) as JsonObject),
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, dereference(nested, references)])
  )
}

/**
 * The response migration contract is intentionally closed-world: an unlisted
 * response field is a regression too. OpenAPI defaults to allowing extra
 * properties, so tests close every response object unless the schema explicitly
 * opts into a map with `additionalProperties: true` (for example activity
 * metadata). Requests retain OpenAPI's default because the v1 Zod boundaries
 * accept and strip unknown input properties.
 */
function closeObjectSchemas(value: unknown, allOfBranch = false): unknown {
  if (Array.isArray(value)) return value.map((item) => closeObjectSchemas(item, allOfBranch))
  if (!isObject(value)) return value

  const isAllOfComposite = Array.isArray(value.allOf)
  const result = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key === "allOf"
        ? closeObjectSchemas(nested, true)
        : closeObjectSchemas(nested, false),
    ])
  )

  if (value.type === "object" && value.additionalProperties === undefined && !allOfBranch) {
    result.additionalProperties = false
  }
  if (isAllOfComposite && value.unevaluatedProperties === undefined) {
    result.unevaluatedProperties = false
  }

  return result
}

function operations(): OpenApiOperation[] {
  return Object.values(document.paths ?? {}).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ["get", "post", "put", "patch", "delete", "options", "head"].includes(method))
      .map(([, operation]) => operation as OpenApiOperation)
  )
}

function operation(operationId: string): OpenApiOperation {
  const found = operations().find((candidate) => candidate.operationId === operationId)
  if (!found) throw new Error(`Unknown OpenAPI operationId: ${operationId}`)
  return found
}

function requiredOperationId(candidate: OpenApiOperation): string {
  if (!candidate.operationId) throw new Error("Every OpenAPI operation must have an operationId")
  return candidate.operationId
}

function jsonSchema(container: unknown): unknown {
  const resolvedContainer = dereference(container)
  if (!isObject(resolvedContainer)) return undefined
  const content = resolvedContainer.content
  if (!isObject(content)) return undefined
  const json = content["application/json"]
  if (!isObject(json)) return undefined
  return json.schema
}

function result(validator: ValidateFunction, value: unknown): SchemaValidationResult {
  const valid = validator(value)
  return {
    valid: Boolean(valid),
    errors: valid ? [] : [...(validator.errors ?? [])],
  }
}

export function validateOpenApiResponse(
  operationId: string,
  status: number,
  body: unknown
): SchemaValidationResult {
  const cacheKey = `${operationId}:${status}`
  let validator = responseValidators.get(cacheKey)

  if (!validator) {
    const responses = operation(operationId).responses ?? {}
    const response = responses[String(status)] ?? responses.default
    if (!response) throw new Error(`${operationId} does not document response status ${status}`)
    const schema = jsonSchema(response)
    if (!schema) throw new Error(`${operationId} response ${status} has no application/json schema`)
    validator = ajv.compile(closeObjectSchemas(dereference(schema)) as AnySchema)
    responseValidators.set(cacheKey, validator)
  }

  const validation = result(validator, body)
  if (validation.valid) validatedResponseKeys.add(cacheKey)
  return validation
}

export function openApiOperationIdForRequest(method: string, requestUrl: string): string {
  const normalizedMethod = method.trim().toLowerCase()
  const pathname = new URL(requestUrl, "http://openapi.test").pathname.replace(/\/$/, "") || "/"
  const candidates = Object.entries(document.paths ?? {})
    .map(([template, pathItem]) => ({
      operation: pathItem[normalizedMethod] as OpenApiOperation | undefined,
      pattern: pathTemplatePattern(template),
      staticLength: template.replace(/\{[^}]+\}/g, "").length,
    }))
    .filter((candidate) => candidate.operation?.operationId)
    .sort((left, right) => right.staticLength - left.staticLength)
  const match = candidates.find((candidate) => candidate.pattern.test(pathname))
  if (!match?.operation?.operationId) {
    throw new Error(`No OpenAPI operation for ${method.toUpperCase()} ${pathname}`)
  }
  return match.operation.operationId
}

function pathTemplatePattern(template: string): RegExp {
  const pattern = template
    .split("/")
    .map((segment) => /^\{[^}]+\}$/.test(segment) ? "[^/]+" : escapeRegExp(segment))
    .join("/")
  return new RegExp(`^${pattern}/?$`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function validatedOpenApiResponseKeys(): string[] {
  return [...validatedResponseKeys].sort()
}

export function documentedOpenApiSuccessResponseKeys(): string[] {
  return operations()
    .flatMap((candidate) => {
      const operationId = requiredOperationId(candidate)
      return Object.entries(candidate.responses ?? {})
        .filter(([status, response]) => /^2\d\d$/.test(status) && jsonSchema(response) !== undefined)
        .map(([status]) => `${operationId}:${status}`)
    })
    .sort()
}

export function documentedOpenApiRequestOperationIds(): string[] {
  return operations()
    .filter((candidate) => candidate.requestBody !== undefined)
    .map(requiredOperationId)
    .sort()
}

export function validateOpenApiRequest(
  operationId: string,
  body: unknown
): SchemaValidationResult {
  let validator = requestValidators.get(operationId)

  if (!validator) {
    const requestBody = operation(operationId).requestBody
    if (!requestBody) throw new Error(`${operationId} does not document a request body`)
    const schema = jsonSchema(requestBody)
    if (!schema) throw new Error(`${operationId} request has no application/json schema`)
    validator = ajv.compile(dereference(schema) as AnySchema)
    requestValidators.set(operationId, validator)
  }

  return result(validator, body)
}
