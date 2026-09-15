import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const runner = readFileSync(resolve(import.meta.dirname, "../../docker-entrypoint.sh"), "utf8")
const migrationLoopStart = runner.indexOf("for migration_file in")
const bootstrap = runner.slice(0, migrationLoopStart)
const migrations = runner.slice(migrationLoopStart)

function position(source: string, fragment: string): number {
  const index = source.indexOf(fragment)
  expect(index, `Missing migration-runner fragment: ${fragment}`).toBeGreaterThanOrEqual(0)
  return index
}

describe("container migration runner locking", () => {
  it("bootstraps Prisma migration metadata under the same transaction-scoped advisory lock", () => {
    const begin = position(bootstrap, "BEGIN;")
    const lock = position(bootstrap, "SELECT pg_advisory_xact_lock(")
    const table = position(bootstrap, 'CREATE TABLE IF NOT EXISTS "_prisma_migrations"')
    const index = position(
      bootstrap,
      'CREATE UNIQUE INDEX IF NOT EXISTS "_prisma_migrations_finished_name_key"'
    )
    const commit = position(bootstrap, "COMMIT;")

    expect(begin).toBeLessThan(lock)
    expect(lock).toBeLessThan(table)
    expect(table).toBeLessThan(index)
    expect(index).toBeLessThan(commit)
  })

  it("serializes metadata bootstrap and every migration with the same schema-specific key", () => {
    const lockKey = "hashtextextended('slopwise:migrations:' || current_schema(), 0)"

    expect(bootstrap.match(new RegExp(lockKey.replace(/[()|+.]/g, "\\$&"), "g"))).toHaveLength(1)
    expect(migrations).toContain(lockKey)
    expect(migrations.indexOf("BEGIN;")).toBeLessThan(migrations.indexOf(lockKey))
    expect(migrations.indexOf(lockKey)).toBeLessThan(
      migrations.indexOf('FROM "_prisma_migrations"')
    )
  })
})
