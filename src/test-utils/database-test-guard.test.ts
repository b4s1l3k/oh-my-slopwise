import { describe, expect, it } from "vitest"
import {
  deriveTestDatabaseUrl,
  requireSafeTestDatabaseUrl,
} from "@/test-utils/database-test-guard"

describe("requireSafeTestDatabaseUrl", () => {
  it("requires an explicit test database URL", () => {
    expect(() => requireSafeTestDatabaseUrl(undefined, undefined)).toThrow(
      "RUN_DB_INTEGRATION_TESTS requires TEST_DATABASE_URL"
    )
  })

  it("rejects malformed and non-PostgreSQL URLs", () => {
    expect(() => requireSafeTestDatabaseUrl("not-a-url", undefined)).toThrow(
      "TEST_DATABASE_URL must be a valid PostgreSQL URL"
    )
    expect(() => requireSafeTestDatabaseUrl("mysql://localhost/splitwise_test", undefined)).toThrow(
      "TEST_DATABASE_URL must use the postgres or postgresql protocol"
    )
  })

  it("requires a standalone test marker in the database name", () => {
    expect(() =>
      requireSafeTestDatabaseUrl("postgresql://localhost/splitwise", undefined)
    ).toThrow("TEST_DATABASE_URL database name must contain a standalone 'test' marker")
    expect(() =>
      requireSafeTestDatabaseUrl("postgresql://localhost/contest", undefined)
    ).toThrow("TEST_DATABASE_URL database name must contain a standalone 'test' marker")
  })

  it("rejects the application database even when query parameters differ", () => {
    expect(() =>
      requireSafeTestDatabaseUrl(
        "postgresql://localhost:5432/splitwise_test?schema=public",
        "postgres://localhost:5432/splitwise_test?connection_limit=5"
      )
    ).toThrow("TEST_DATABASE_URL must not point to the application database")
  })

  it("returns a dedicated test database URL unchanged", () => {
    const testDatabaseUrl = "postgresql://localhost:5432/splitwise_test"

    expect(
      requireSafeTestDatabaseUrl(
        testDatabaseUrl,
        "postgresql://localhost:5432/splitwise"
      )
    ).toBe(testDatabaseUrl)
  })
})

describe("deriveTestDatabaseUrl", () => {
  it("derives a separate test database and preserves connection options", () => {
    const result = deriveTestDatabaseUrl(
      "postgresql://localhost:5432/splitwise?schema=accounting"
    )
    const parsed = new URL(result)

    expect(parsed.pathname).toBe("/splitwise_test")
    expect(parsed.searchParams.get("schema")).toBe("accounting")
  })

  it("requires an application database URL when no override is configured", () => {
    expect(() => deriveTestDatabaseUrl(undefined)).toThrow(
      "DATABASE_URL or an explicit TEST_DATABASE_URL is required for DB tests"
    )
  })
})
