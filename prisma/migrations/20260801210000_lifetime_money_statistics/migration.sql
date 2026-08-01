-- Keep monetary lifetime totals grouped by their original currency. Existing
-- count and record facts do not need a currency and remain unchanged.
ALTER TABLE "user_statistic_facts" ADD COLUMN "currency" TEXT;

CREATE INDEX "user_statistic_facts_userId_kind_currency_idx"
    ON "user_statistic_facts"("userId", "kind", "currency");

-- Backfill every expense that still exists when the migration is deployed.
INSERT INTO "user_statistic_facts"
    ("id", "userId", "kind", "reference", "value", "currency")
SELECT 'stat-' || md5(e."paidById" || ':MONEY_SPENT:' || e."id"),
       e."paidById", 'MONEY_SPENT', e."id", e."amount", e."currency"
FROM "expenses" e
ON CONFLICT ("userId", "kind", "reference") DO UPDATE
SET "value" = EXCLUDED."value",
    "currency" = EXCLUDED."currency";

-- A returned amount is a recorded settlement received by the user. This
-- includes cash handed over when an expense is entered.
INSERT INTO "user_statistic_facts"
    ("id", "userId", "kind", "reference", "value", "currency")
SELECT 'stat-' || md5(s."toUserId" || ':MONEY_RETURNED:' || s."id"),
       s."toUserId", 'MONEY_RETURNED', s."id", s."amount", s."currency"
FROM "settlements" s
ON CONFLICT ("userId", "kind", "reference") DO UPDATE
SET "value" = EXCLUDED."value",
    "currency" = EXCLUDED."currency";
