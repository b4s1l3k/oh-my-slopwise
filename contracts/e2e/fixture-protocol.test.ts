import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"
import { describe, expect, it } from "vitest"
import { DEFAULT_E2E_FIXTURE } from "../../e2e/support/fixture-contract"

const contractRoot = resolve(import.meta.dirname)
const schema = JSON.parse(
  readFileSync(resolve(contractRoot, "fixture-protocol.schema.json"), "utf8")
)

describe("language-neutral E2E fixture protocol", () => {
  it("keeps the canonical fixture valid and identities unique", () => {
    const validate = protocolValidator()

    expect(
      validate(DEFAULT_E2E_FIXTURE),
      JSON.stringify(validate.errors)
    ).toBe(true)
    expect(new Set(DEFAULT_E2E_FIXTURE.users.map((user) => user.fixtureId)).size).toBe(5)
    expect(new Set(DEFAULT_E2E_FIXTURE.users.map((user) => user.email)).size).toBe(5)
  })

  it.each([
    { protocolVersion: 1, ok: true },
    {
      protocolVersion: 1,
      ok: false,
      error: { code: "RESET_FAILED", message: "database unavailable" },
    },
  ])("accepts a fixture adapter response", (response) => {
    const validate = protocolValidator()

    expect(validate(response), JSON.stringify(validate.errors)).toBe(true)
  })
})

function protocolValidator() {
  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema)
}
