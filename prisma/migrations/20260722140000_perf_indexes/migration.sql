-- GroupMember: fast lookup by userId (getUserGroups, getOverviewBalances)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_members_userId_isActive_idx"
  ON "group_members" ("userId", "isActive");

-- Expense: fast paginated list sorted by date per group
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_groupId_date_idx"
  ON "expenses" ("groupId", "date" DESC);

-- Settlement: fast sorted list per group
CREATE INDEX CONCURRENTLY IF NOT EXISTS "settlements_groupId_date_idx"
  ON "settlements" ("groupId", "date" DESC);

-- ExchangeRate: fast fallback lookup by currency when CBR is unavailable
CREATE INDEX CONCURRENTLY IF NOT EXISTS "exchange_rates_currency_date_idx"
  ON "exchange_rates" ("currency", "date" DESC);
