import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip

type ColumnRow = {
  table_name: string
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: "YES" | "NO"
}

describeDatabase("database architecture contract", () => {
  afterAll(async () => prisma.$disconnect())

  it("uses explicit calendar, instant and decimal storage types", async () => {
    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (table_name, column_name) IN (
          ('expenses', 'date'),
          ('settlements', 'date'),
          ('expenses', 'createdAt'),
          ('group_members', 'groupUpdatedAt'),
          ('expenses', 'customRate'),
          ('exchange_rates', 'rate'),
          ('expenses', 'amountBase'),
          ('expense_splits', 'amountBase'),
          ('settlements', 'amountBase')
        )
    `
    const byColumn = Object.fromEntries(columns.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column,
    ]))

    expect(byColumn["expenses.date"].data_type).toBe("date")
    expect(byColumn["settlements.date"].data_type).toBe("date")
    expect(byColumn["expenses.createdAt"].data_type).toBe("timestamp with time zone")
    expect(byColumn["group_members.groupUpdatedAt"].data_type).toBe("timestamp with time zone")
    expect(byColumn["group_members.groupUpdatedAt"].is_nullable).toBe("NO")
    expect(byColumn["expenses.customRate"].data_type).toBe("numeric")
    expect(byColumn["exchange_rates.rate"].data_type).toBe("numeric")
    for (const key of [
      "expenses.amountBase",
      "expense_splits.amountBase",
      "settlements.amountBase",
    ]) {
      expect(byColumn[key].is_nullable, key).toBe("NO")
    }
  })

  it("contains the indexes required by bounded ordered reads", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `
    const definitions = new Map(indexes.map((index) => [index.indexname, index.indexdef]))

    for (const name of [
      "expenses_groupId_date_createdAt_id_idx",
      "settlements_groupId_date_createdAt_id_idx",
      "activity_log_groupId_createdAt_id_idx",
      "feedbacks_createdAt_id_idx",
      "users_name_trgm_idx",
      "group_invites_one_active_per_group_key",
      "group_member_positions_userId_groupId_idx",
      "user_statistic_facts_reference_kind_idx",
      "group_members_userId_isActive_groupUpdatedAt_groupId_idx",
    ]) {
      expect(definitions.has(name), name).toBe(true)
    }
    expect(definitions.get("group_invites_one_active_per_group_key")).toContain(
      "WHERE (revoked = false)"
    )
    expect(definitions.has("user_statistic_facts_userId_kind_idx")).toBe(false)
    expect(definitions.has("users_email_normalized_key")).toBe(false)
    expect(definitions.has("group_members_userId_isActive_idx")).toBe(false)
    expect(definitions.get("group_members_userId_isActive_groupUpdatedAt_groupId_idx")).toContain(
      '("userId", "isActive", "groupUpdatedAt" DESC, "groupId" DESC)'
    )
  })

  it("keeps read models and cross-writer invariant triggers installed", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
    `
    const tableNames = new Set(tables.map((table) => table.table_name))
    for (const name of [
      "group_member_positions",
      "user_statistic_metrics",
      "user_statistic_currencies",
      "user_statistic_money",
    ]) {
      expect(tableNames.has(name), name).toBe(true)
    }
    expect(tableNames.has("friendships")).toBe(false)

    const triggers = await prisma.$queryRaw<Array<{
      tgname: string
      definition: string
      tgdeferrable: boolean
      tginitdeferred: boolean
    }>>`
      SELECT trigger.tgname,
             pg_get_triggerdef(trigger.oid) AS definition,
             trigger.tgdeferrable,
             trigger.tginitdeferred
      FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema() AND NOT trigger.tgisinternal
    `
    const triggerNames = new Set(triggers.map((trigger) => trigger.tgname))
    for (const name of [
      "00_group_members_lock_group_invariants",
      "00_groups_lock_group_invariants",
      "00_expenses_lock_group_invariants",
      "00_expense_splits_lock_group_invariants",
      "00_settlements_lock_group_invariants",
      "expenses_validate_aggregate",
      "settlements_validate_aggregate",
      "group_members_validate_aggregate",
      "group_member_positions_validate_inactive",
      "expenses_project_position",
      "expense_splits_project_position",
      "settlements_project_position",
      "user_statistic_facts_project",
      "users_set_updatedAt",
      "groups_set_updatedAt",
      "expenses_set_updatedAt",
      "groups_protect_financial_identity",
      "expenses_protect_financial_identity",
      "settlements_protect_financial_identity",
      "group_members_set_groupUpdatedAt",
      "groups_project_member_updatedAt",
    ]) {
      expect(triggerNames.has(name), name).toBe(true)
    }
    for (const name of [
      "00_group_members_lock_group_invariants",
      "00_groups_lock_group_invariants",
      "00_expenses_lock_group_invariants",
      "00_expense_splits_lock_group_invariants",
      "00_settlements_lock_group_invariants",
    ]) {
      const trigger = triggers.find((candidate) => candidate.tgname === name)
      expect(trigger?.definition, name).toContain("BEFORE")
      expect(trigger?.definition, name).toContain("lock_financial_group_early()")
      expect(trigger?.tgdeferrable, name).toBe(false)
    }
    expect(
      triggers.find((trigger) => trigger.tgname === "group_members_set_groupUpdatedAt")?.definition
    ).toContain("BEFORE INSERT OR UPDATE")
    expect(
      triggers.find((trigger) => trigger.tgname === "groups_project_member_updatedAt")?.definition
    ).toContain("AFTER UPDATE")
    for (const name of [
      "expenses_validate_aggregate",
      "expense_splits_validate_aggregate",
      "settlements_validate_aggregate",
      "group_members_validate_aggregate",
    ]) {
      const trigger = triggers.find((candidate) => candidate.tgname === name)
      expect(trigger?.tgdeferrable, name).toBe(true)
      expect(trigger?.tginitdeferred, name).toBe(true)
    }

    const functions = await prisma.$queryRaw<Array<{ proname: string }>>`
      SELECT routine.proname
      FROM pg_proc routine
      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = current_schema()
    `
    const functionNames = new Set(functions.map((routine) => routine.proname))
    for (const name of [
      "lock_group_invariants",
      "lock_financial_group_early",
      "rebuild_group_member_positions",
      "rebuild_user_statistic_projections",
      "set_group_member_group_updated_at",
      "project_group_updated_at_to_members",
    ]) {
      expect(functionNames.has(name), name).toBe(true)
    }
  })
})
