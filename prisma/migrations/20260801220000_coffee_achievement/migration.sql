-- Backfill the hidden coffee achievement from expenses that still exist.
-- Future coffee expenses are recorded transactionally by the application.
INSERT INTO "user_statistic_facts" ("id", "userId", "kind", "reference")
SELECT 'stat-' || md5(e."paidById" || ':COFFEE_PAID:' || e."id"),
       e."paidById", 'COFFEE_PAID', e."id"
FROM "expenses" e
WHERE lower(e."title" || ' ' || coalesce(e."category", '')) LIKE ANY (ARRAY[
        '%кофе%', '%coffee%', '%cappuccino%', '%капучино%', '%latte%', '%латте%',
        '%espresso%', '%эспрессо%', '%americano%', '%американо%'
      ])
   OR lower(trim(e."title" || ' ' || coalesce(e."category", ''))) = 'раф'
   OR lower(e."title" || ' ' || coalesce(e."category", '')) LIKE 'раф %'
   OR lower(e."title" || ' ' || coalesce(e."category", '')) LIKE '% раф'
   OR lower(e."title" || ' ' || coalesce(e."category", '')) LIKE '% раф %'
ON CONFLICT DO NOTHING;
