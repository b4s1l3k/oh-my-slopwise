import { describe, expect, it } from "vitest"
import { buildRuntimeDatabaseUrl } from "@/lib/database-url"

describe("buildRuntimeDatabaseUrl", () => {
  it("adds bounded pool and connection timeouts", () => {
    const result = new URL(buildRuntimeDatabaseUrl(
      "postgresql://user:password@db.example:5432/splitwise?schema=public"
    )!)

    expect(Object.fromEntries(result.searchParams)).toMatchObject({
      schema: "public",
      connection_limit: "10",
      pool_timeout: "10",
      connect_timeout: "5",
      socket_timeout: "15",
    })
  })

  it("preserves explicit operator settings", () => {
    const result = new URL(buildRuntimeDatabaseUrl(
      "postgresql://db.example/splitwise?connection_limit=3&pool_timeout=7&connect_timeout=9&socket_timeout=11"
    )!)

    expect(Object.fromEntries(result.searchParams)).toMatchObject({
      connection_limit: "3",
      pool_timeout: "7",
      connect_timeout: "9",
      socket_timeout: "11",
    })
  })

  it("allows build-time imports without a configured database", () => {
    expect(buildRuntimeDatabaseUrl(undefined)).toBeUndefined()
  })

  it.each(["not-a-url", "mysql://db.example/splitwise"])("rejects %s", (value) => {
    expect(() => buildRuntimeDatabaseUrl(value)).toThrow("DATABASE_URL")
  })
})
