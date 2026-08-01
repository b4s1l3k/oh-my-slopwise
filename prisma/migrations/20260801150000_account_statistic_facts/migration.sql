-- Lifetime account statistics are stored independently from deletable domain rows.
CREATE TABLE "user_statistic_facts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_statistic_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_statistic_facts_userId_kind_reference_key"
    ON "user_statistic_facts"("userId", "kind", "reference");
CREATE INDEX "user_statistic_facts_userId_kind_idx"
    ON "user_statistic_facts"("userId", "kind");

ALTER TABLE "user_statistic_facts"
    ADD CONSTRAINT "user_statistic_facts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Groups created and groups ever joined (including currently inactive memberships).
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(g."createdById" || ':GROUP_CREATED:' || g."id"),
       g."createdById", 'GROUP_CREATED', g."id"
FROM "groups" g
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(gm."userId" || ':GROUP_JOINED_' || g."type"::text || ':' || g."id"),
       gm."userId", 'GROUP_JOINED_' || g."type"::text, g."id"
FROM "group_members" gm
JOIN "groups" g ON g."id" = gm."groupId"
ON CONFLICT DO NOTHING;

-- Every person who has shared a group with the user remains part of account history.
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT DISTINCT
       'stat-' || md5(left_member."userId" || ':PEER:' || right_member."userId"),
       left_member."userId", 'PEER', right_member."userId"
FROM "group_members" left_member
JOIN "group_members" right_member
  ON right_member."groupId" = left_member."groupId"
 AND right_member."userId" <> left_member."userId"
ON CONFLICT DO NOTHING;

-- Expense actions and methods used.
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."createdById" || ':EXPENSE_CREATED:' || e."id"),
       e."createdById", 'EXPENSE_CREATED', e."id"
FROM "expenses" e
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(es."userId" || ':EXPENSE_PARTICIPATED:' || es."expenseId"),
       es."userId", 'EXPENSE_PARTICIPATED', es."expenseId"
FROM "expense_splits" es
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."paidById" || ':EXPENSE_PAID:' || e."id"),
       e."paidById", 'EXPENSE_PAID', e."id"
FROM "expenses" e
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."createdById" || ':CREATED_FOR_OTHER:' || e."id"),
       e."createdById", 'CREATED_FOR_OTHER', e."id"
FROM "expenses" e
WHERE e."createdById" <> e."paidById"
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."createdById" || ':SPLIT_' || e."splitType"::text || ':' || e."id"),
       e."createdById", 'SPLIT_' || e."splitType"::text, e."id"
FROM "expenses" e
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."createdById" || ':CUSTOM_RATE:' || e."id"),
       e."createdById", 'CUSTOM_RATE', e."id"
FROM "expenses" e
WHERE e."customRate" IS NOT NULL
ON CONFLICT DO NOTHING;

-- A currency is counted once for every account that created, paid or participated.
WITH user_currencies AS (
    SELECT e."createdById" AS "userId", e."currency" FROM "expenses" e
    UNION
    SELECT e."paidById" AS "userId", e."currency" FROM "expenses" e
    UNION
    SELECT es."userId", e."currency"
    FROM "expense_splits" es
    JOIN "expenses" e ON e."id" = es."expenseId"
)
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(uc."userId" || ':CURRENCY:' || uc."currency"),
       uc."userId", 'CURRENCY', uc."currency"
FROM user_currencies uc
ON CONFLICT DO NOTHING;

-- Settlements and invitations are lifetime actions even if their group is deleted.
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(s."fromUserId" || ':SETTLEMENT_SENT:' || s."id"),
       s."fromUserId", 'SETTLEMENT_SENT', s."id"
FROM "settlements" s
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(s."toUserId" || ':SETTLEMENT_RECEIVED:' || s."id"),
       s."toUserId", 'SETTLEMENT_RECEIVED', s."id"
FROM "settlements" s
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(s."fromUserId" || ':CASH_SETTLEMENT:' || s."id"),
       s."fromUserId", 'CASH_SETTLEMENT', s."id"
FROM "settlements" s
WHERE s."expenseId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(i."createdById" || ':INVITE_CREATED:' || i."id"),
       i."createdById", 'INVITE_CREATED', i."id"
FROM "group_invites" i
ON CONFLICT DO NOTHING;

-- Seed the best known records from data that still exists at migration time.
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference", "value")
SELECT 'stat-' || md5(gm."userId" || ':ACTIVE_GROUPS_RECORD:all'),
       gm."userId", 'ACTIVE_GROUPS_RECORD', 'all', COUNT(*)::integer
FROM "group_members" gm
WHERE gm."isActive" = true
GROUP BY gm."userId"
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference", "value")
SELECT 'stat-' || md5(e."createdById" || ':EXPENSE_PARTICIPANTS_RECORD:' || e."id"),
       e."createdById", 'EXPENSE_PARTICIPANTS_RECORD', e."id", COUNT(es."id")::integer
FROM "expenses" e
LEFT JOIN "expense_splits" es ON es."expenseId" = e."id"
GROUP BY e."id", e."createdById"
ON CONFLICT DO NOTHING;

INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference", "value")
SELECT 'stat-' || md5(e."createdById" || ':PAID_PARTICIPANTS_RECORD:' || e."id"),
       e."createdById", 'PAID_PARTICIPANTS_RECORD', e."id", COUNT(es."id")::integer
FROM "expenses" e
LEFT JOIN "expense_splits" es ON es."expenseId" = e."id"
WHERE e."createdById" = e."paidById"
GROUP BY e."id", e."createdById"
ON CONFLICT DO NOTHING;

WITH group_sizes AS (
    SELECT gm."groupId", COUNT(*)::integer AS member_count
    FROM "group_members" gm
    GROUP BY gm."groupId"
)
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference", "value")
SELECT 'stat-' || md5(gm."userId" || ':GROUP_MEMBERS_RECORD:' || gm."groupId"),
       gm."userId", 'GROUP_MEMBERS_RECORD', gm."groupId", gs.member_count
FROM "group_members" gm
JOIN group_sizes gs ON gs."groupId" = gm."groupId"
ON CONFLICT DO NOTHING;

WITH group_expense_counts AS (
    SELECT g."id" AS "groupId", COUNT(e."id")::integer AS expense_count
    FROM "groups" g
    LEFT JOIN "expenses" e ON e."groupId" = g."id"
    GROUP BY g."id"
)
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference", "value")
SELECT 'stat-' || md5(gm."userId" || ':GROUP_EXPENSES_RECORD:' || gm."groupId"),
       gm."userId", 'GROUP_EXPENSES_RECORD', gm."groupId", gec.expense_count
FROM "group_members" gm
JOIN group_expense_counts gec ON gec."groupId" = gm."groupId"
ON CONFLICT DO NOTHING;
