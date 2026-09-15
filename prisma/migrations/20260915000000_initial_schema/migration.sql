-- Fresh-install baseline generated from the verified PostgreSQL schema.
-- No legacy data migration or compatibility path is intentionally retained.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Functions are declared before their tables in this dependency-ordered dump.
SET check_function_bodies = false;

--
-- Name: ActivityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "ActivityType" AS ENUM (
    'EXPENSE_CREATED',
    'EXPENSE_UPDATED',
    'EXPENSE_DELETED',
    'SETTLEMENT_CREATED',
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'GROUP_UPDATED',
    'SETTLEMENTS_RESET'
);


--
-- Name: GroupMemberRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "GroupMemberRole" AS ENUM (
    'ADMIN',
    'MEMBER'
);


--
-- Name: GroupType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "GroupType" AS ENUM (
    'HOME',
    'TRIP',
    'COUPLE',
    'OTHER'
);


--
-- Name: IdempotencyOperation; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "IdempotencyOperation" AS ENUM (
    'CREATE_GROUP',
    'CREATE_EXPENSE',
    'CREATE_SETTLEMENT',
    'CREATE_FEEDBACK'
);


--
-- Name: SplitType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "SplitType" AS ENUM (
    'EQUAL',
    'EXACT',
    'PERCENTAGE'
);


--
-- Name: adjust_group_member_position(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION adjust_group_member_position(target_group_id text, target_user_id text, balance_delta bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF balance_delta = 0 OR NOT EXISTS (
    SELECT 1 FROM "groups" WHERE "id" = target_group_id
  ) THEN
    RETURN;
  END IF;
  INSERT INTO "group_member_positions" ("groupId", "userId", "balance")
  VALUES (target_group_id, target_user_id, balance_delta)
  ON CONFLICT ("groupId", "userId") DO UPDATE
  SET "balance" = "group_member_positions"."balance" + EXCLUDED."balance",
      "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;


--
-- Name: adjust_statistic_currency(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION adjust_statistic_currency(target_user_id text, target_currency text, count_delta bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = target_user_id) THEN
    RETURN;
  END IF;
  IF target_currency IS NULL THEN RETURN; END IF;
  IF count_delta > 0 THEN
    INSERT INTO "user_statistic_currencies" ("userId", "currency", "factCount")
    VALUES (target_user_id, target_currency, count_delta)
    ON CONFLICT ("userId", "currency") DO UPDATE
    SET "factCount" = "user_statistic_currencies"."factCount" + EXCLUDED."factCount";
  ELSE
    DELETE FROM "user_statistic_currencies"
    WHERE "userId" = target_user_id AND "currency" = target_currency
      AND "factCount" <= -count_delta;
    IF NOT FOUND THEN
      UPDATE "user_statistic_currencies"
      SET "factCount" = "factCount" + count_delta
      WHERE "userId" = target_user_id AND "currency" = target_currency;
    END IF;
  END IF;
END;
$$;


--
-- Name: adjust_statistic_metric(text, text, bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION adjust_statistic_metric(target_user_id text, target_kind text, count_delta bigint, candidate_max integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = target_user_id) THEN
    RETURN;
  END IF;
  IF count_delta > 0 THEN
    INSERT INTO "user_statistic_metrics" ("userId", "kind", "factCount", "maxValue")
    VALUES (target_user_id, target_kind, count_delta, candidate_max)
    ON CONFLICT ("userId", "kind") DO UPDATE
    SET "factCount" = "user_statistic_metrics"."factCount" + EXCLUDED."factCount",
        "maxValue" = greatest("user_statistic_metrics"."maxValue", EXCLUDED."maxValue");
  ELSE
    DELETE FROM "user_statistic_metrics"
    WHERE "userId" = target_user_id AND "kind" = target_kind
      AND "factCount" <= -count_delta;
    IF NOT FOUND THEN
      UPDATE "user_statistic_metrics"
      SET "factCount" = "factCount" + count_delta,
          "maxValue" = COALESCE((
            SELECT max(fact."value")
            FROM "user_statistic_facts" fact
            WHERE fact."userId" = target_user_id AND fact."kind" = target_kind
          ), 0)
      WHERE "userId" = target_user_id AND "kind" = target_kind;
    END IF;
  END IF;
END;
$$;


--
-- Name: adjust_statistic_money(text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION adjust_statistic_money(target_user_id text, target_kind text, target_currency text, value_delta bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = target_user_id) THEN
    RETURN;
  END IF;
  IF target_currency IS NULL OR target_kind NOT IN ('MONEY_SPENT', 'MONEY_RETURNED') THEN
    RETURN;
  END IF;
  IF value_delta > 0 THEN
    INSERT INTO "user_statistic_money" ("userId", "kind", "currency", "totalValue")
    VALUES (target_user_id, target_kind, target_currency, value_delta)
    ON CONFLICT ("userId", "kind", "currency") DO UPDATE
    SET "totalValue" = "user_statistic_money"."totalValue" + EXCLUDED."totalValue";
  ELSE
    DELETE FROM "user_statistic_money"
    WHERE "userId" = target_user_id AND "kind" = target_kind
      AND "currency" = target_currency AND "totalValue" <= -value_delta;
    IF NOT FOUND THEN
      UPDATE "user_statistic_money"
      SET "totalValue" = "totalValue" + value_delta
      WHERE "userId" = target_user_id AND "kind" = target_kind
        AND "currency" = target_currency;
    END IF;
  END IF;
END;
$$;


--
-- Name: delete_expense_children_before_parent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_expense_children_before_parent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Explicit child deletion keeps the parent expense visible to split
  -- projection triggers. The subsequent FK cascade has no remaining work.
  DELETE FROM "settlements" WHERE "expenseId" = OLD."id";
  DELETE FROM "expense_splits" WHERE "expenseId" = OLD."id";
  RETURN OLD;
END;
$$;


--
-- Name: lock_financial_group_early(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION lock_financial_group_early() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_group_id text;
  new_group_id text;
  old_expense_id text;
  new_expense_id text;
  target_group_id text;
BEGIN
  IF TG_TABLE_NAME = 'group_members' THEN
    IF TG_OP = 'UPDATE'
       AND NEW."groupId" IS NOT DISTINCT FROM OLD."groupId"
       AND NEW."userId" IS NOT DISTINCT FROM OLD."userId"
       AND NEW."role" IS NOT DISTINCT FROM OLD."role"
       AND NEW."isActive" IS NOT DISTINCT FROM OLD."isActive" THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'groups' THEN
    IF TG_OP <> 'INSERT' THEN
      old_group_id := OLD."id";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_group_id := NEW."id";
    END IF;
  ELSIF TG_TABLE_NAME IN ('group_members', 'expenses', 'settlements') THEN
    IF TG_OP <> 'INSERT' THEN
      old_group_id := to_jsonb(OLD) ->> 'groupId';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_group_id := to_jsonb(NEW) ->> 'groupId';
    END IF;
  ELSIF TG_TABLE_NAME = 'expense_splits' THEN
    IF TG_OP <> 'INSERT' THEN
      old_expense_id := to_jsonb(OLD) ->> 'expenseId';
      SELECT "groupId" INTO old_group_id
      FROM "expenses"
      WHERE "id" = old_expense_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_expense_id := to_jsonb(NEW) ->> 'expenseId';
      IF new_expense_id = old_expense_id THEN
        new_group_id := old_group_id;
      ELSE
        SELECT "groupId" INTO new_group_id
        FROM "expenses"
        WHERE "id" = new_expense_id;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'lock_financial_group_early cannot run for table %', TG_TABLE_NAME;
  END IF;

  FOR target_group_id IN
    SELECT DISTINCT candidate.group_id
    FROM unnest(ARRAY[old_group_id, new_group_id]) AS candidate(group_id)
    WHERE candidate.group_id IS NOT NULL
    ORDER BY candidate.group_id
  LOOP
    PERFORM lock_group_invariants(target_group_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: lock_group_invariants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION lock_group_invariants(target_group_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('slopwise:group:' || target_group_id, 0)
  );
END;
$$;


--
-- Name: project_expense_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION project_expense_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM adjust_group_member_position(OLD."groupId", OLD."paidById", -OLD."amountBase"::bigint);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM adjust_group_member_position(NEW."groupId", NEW."paidById", NEW."amountBase"::bigint);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: project_expense_split_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION project_expense_split_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_group_id text;
  new_group_id text;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT "groupId" INTO old_group_id FROM "expenses" WHERE "id" = OLD."expenseId";
    IF old_group_id IS NOT NULL THEN
      PERFORM adjust_group_member_position(old_group_id, OLD."userId", OLD."amountBase"::bigint);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "groupId" INTO new_group_id FROM "expenses" WHERE "id" = NEW."expenseId";
    IF new_group_id IS NOT NULL THEN
      PERFORM adjust_group_member_position(new_group_id, NEW."userId", -NEW."amountBase"::bigint);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: project_group_updated_at_to_members(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION project_group_updated_at_to_members() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE "group_members"
  SET "groupUpdatedAt" = NEW."updatedAt"
  WHERE "groupId" = NEW."id"
    AND "groupUpdatedAt" IS DISTINCT FROM NEW."updatedAt";
  RETURN NULL;
END;
$$;


--
-- Name: project_settlement_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION project_settlement_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM adjust_group_member_position(OLD."groupId", OLD."fromUserId", -OLD."amountBase"::bigint);
    PERFORM adjust_group_member_position(OLD."groupId", OLD."toUserId", OLD."amountBase"::bigint);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM adjust_group_member_position(NEW."groupId", NEW."fromUserId", NEW."amountBase"::bigint);
    PERFORM adjust_group_member_position(NEW."groupId", NEW."toUserId", -NEW."amountBase"::bigint);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: project_user_statistic_fact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION project_user_statistic_fact() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM adjust_statistic_metric(OLD."userId", OLD."kind", -1, OLD."value");
    IF OLD."kind" = 'CURRENCY' THEN
      PERFORM adjust_statistic_currency(OLD."userId", OLD."currency", -1);
    END IF;
    PERFORM adjust_statistic_money(OLD."userId", OLD."kind", OLD."currency", -OLD."value"::bigint);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM adjust_statistic_metric(NEW."userId", NEW."kind", 1, NEW."value");
    IF NEW."kind" = 'CURRENCY' THEN
      PERFORM adjust_statistic_currency(NEW."userId", NEW."currency", 1);
    END IF;
    PERFORM adjust_statistic_money(NEW."userId", NEW."kind", NEW."currency", NEW."value"::bigint);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: protect_financial_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION protect_financial_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'groups' AND (
    new_row ->> 'createdById' IS DISTINCT FROM old_row ->> 'createdById'
    OR new_row ->> 'currency' IS DISTINCT FROM old_row ->> 'currency'
  ) THEN
    RAISE EXCEPTION 'group creator and settlement currency are immutable'
      USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'expenses' AND (
    new_row ->> 'groupId' IS DISTINCT FROM old_row ->> 'groupId'
    OR new_row ->> 'createdById' IS DISTINCT FROM old_row ->> 'createdById'
  ) THEN
    RAISE EXCEPTION 'expense group and creator are immutable'
      USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'settlements' AND (
    new_row ->> 'groupId' IS DISTINCT FROM old_row ->> 'groupId'
    OR new_row ->> 'expenseId' IS DISTINCT FROM old_row ->> 'expenseId'
    OR new_row ->> 'fromUserId' IS DISTINCT FROM old_row ->> 'fromUserId'
  ) THEN
    RAISE EXCEPTION 'settlement group, expense and sender are immutable'
      USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'settlements'
      AND old_row ->> 'expenseId' IS NOT NULL AND (
        new_row ->> 'amount' IS DISTINCT FROM old_row ->> 'amount'
        OR new_row ->> 'currency' IS DISTINCT FROM old_row ->> 'currency'
        OR new_row ->> 'amountBase' IS DISTINCT FROM old_row ->> 'amountBase'
      ) THEN
    RAISE EXCEPTION 'cash settlement monetary facts are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: rebuild_group_member_positions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_group_member_positions() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  LOCK TABLE "expenses", "expense_splits", "settlements"
    IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "group_member_positions" IN EXCLUSIVE MODE;

  DELETE FROM "group_member_positions";
  INSERT INTO "group_member_positions" ("groupId", "userId", "balance")
  SELECT entries."groupId", entries."userId", sum(entries.delta)
  FROM (
    SELECT expense."groupId", expense."paidById" AS "userId",
           expense."amountBase"::bigint AS delta
    FROM "expenses" expense
    UNION ALL
    SELECT expense."groupId", split."userId",
           -split."amountBase"::bigint AS delta
    FROM "expense_splits" split
    JOIN "expenses" expense ON expense."id" = split."expenseId"
    UNION ALL
    SELECT settlement."groupId", settlement."fromUserId" AS "userId",
           settlement."amountBase"::bigint AS delta
    FROM "settlements" settlement
    UNION ALL
    SELECT settlement."groupId", settlement."toUserId" AS "userId",
           -settlement."amountBase"::bigint AS delta
    FROM "settlements" settlement
  ) entries
  GROUP BY entries."groupId", entries."userId";
END;
$$;


--
-- Name: rebuild_user_statistic_projections(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_user_statistic_projections() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  LOCK TABLE "user_statistic_facts" IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "user_statistic_metrics", "user_statistic_currencies", "user_statistic_money"
    IN EXCLUSIVE MODE;

  DELETE FROM "user_statistic_metrics";
  DELETE FROM "user_statistic_currencies";
  DELETE FROM "user_statistic_money";

  INSERT INTO "user_statistic_metrics" ("userId", "kind", "factCount", "maxValue")
  SELECT "userId", "kind", count(*), max("value")
  FROM "user_statistic_facts"
  GROUP BY "userId", "kind";

  INSERT INTO "user_statistic_currencies" ("userId", "currency", "factCount")
  SELECT "userId", "currency", count(*)
  FROM "user_statistic_facts"
  WHERE "kind" = 'CURRENCY' AND "currency" IS NOT NULL
  GROUP BY "userId", "currency";

  INSERT INTO "user_statistic_money" ("userId", "kind", "currency", "totalValue")
  SELECT "userId", "kind", "currency", sum("value")
  FROM "user_statistic_facts"
  WHERE "kind" IN ('MONEY_SPENT', 'MONEY_RETURNED') AND "currency" IS NOT NULL
  GROUP BY "userId", "kind", "currency";
END;
$$;


--
-- Name: set_group_member_group_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION set_group_member_group_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  source_updated_at timestamptz;
BEGIN
  -- FOR SHARE serializes membership insertion/moves with a concurrent group
  -- update: either the group update projects this row, or this read observes it.
  SELECT "updatedAt" INTO source_updated_at
  FROM "groups"
  WHERE "id" = NEW."groupId"
  FOR SHARE;

  IF FOUND THEN
    NEW."groupUpdatedAt" := source_updated_at;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_row_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION set_row_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


--
-- Name: validate_expense_invariants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_expense_invariants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_expense_id text;
  expense_row record;
  split_count integer;
  split_amount_total bigint;
  split_base_total bigint;
  percentage_total bigint;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    target_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    target_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  END IF;

  SELECT * INTO expense_row FROM "expenses" WHERE "id" = target_expense_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM lock_group_invariants(expense_row."groupId");

  IF NOT EXISTS (
    SELECT 1 FROM "group_members"
    WHERE "groupId" = expense_row."groupId"
      AND "userId" = expense_row."paidById" AND "isActive" = true
  ) OR NOT EXISTS (
    SELECT 1 FROM "group_members"
    WHERE "groupId" = expense_row."groupId"
      AND "userId" = expense_row."createdById"
  ) THEN
    RAISE EXCEPTION 'expense payer must be active and creator must belong to the group'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), sum(split."amount"), sum(split."amountBase"), sum(split."percentage")
  INTO split_count, split_amount_total, split_base_total, percentage_total
  FROM "expense_splits" split
  WHERE split."expenseId" = target_expense_id;
  IF split_count < 1 OR split_count > 100 THEN
    RAISE EXCEPTION 'expense must have between 1 and 100 splits'
      USING ERRCODE = '23514';
  END IF;
  IF split_amount_total <> expense_row."amount"
      OR split_base_total <> expense_row."amountBase" THEN
    RAISE EXCEPTION 'expense split totals must equal expense amounts'
      USING ERRCODE = '23514';
  END IF;
  IF expense_row."splitType" = 'PERCENTAGE' THEN
    IF percentage_total <> 10000 OR EXISTS (
      SELECT 1 FROM "expense_splits"
      WHERE "expenseId" = target_expense_id AND "percentage" IS NULL
    ) THEN
      RAISE EXCEPTION 'percentage expense splits must total 10000 basis points'
        USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "expense_splits"
    WHERE "expenseId" = target_expense_id AND "percentage" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'non-percentage expense splits cannot store percentages'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "expense_splits" split
    WHERE split."expenseId" = target_expense_id
      AND NOT EXISTS (
        SELECT 1 FROM "group_members" membership
        WHERE membership."groupId" = expense_row."groupId"
          AND membership."userId" = split."userId"
          AND membership."isActive" = true
      )
  ) THEN
    RAISE EXCEPTION 'every expense split user must be an active group member'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "settlements" settlement
    LEFT JOIN "expense_splits" split
      ON split."expenseId" = target_expense_id
      AND split."userId" = settlement."fromUserId"
    WHERE settlement."expenseId" = target_expense_id
      AND (
        settlement."groupId" <> expense_row."groupId"
        OR settlement."toUserId" <> expense_row."paidById"
        OR split."id" IS NULL
      )
  ) OR EXISTS (
    SELECT 1
    FROM "expense_splits" split
    JOIN LATERAL (
      SELECT sum(settlement."amountBase") AS base_total,
             bool_and(settlement."currency" = expense_row."currency") AS same_currency,
             sum(settlement."amount") AS amount_total
      FROM "settlements" settlement
      WHERE settlement."expenseId" = target_expense_id
        AND settlement."fromUserId" = split."userId"
    ) cash ON true
    WHERE split."expenseId" = target_expense_id
      AND (
        cash.base_total > split."amountBase"
        OR (cash.same_currency AND cash.amount_total > split."amount")
      )
  ) THEN
    RAISE EXCEPTION 'cash settlements must match the expense payer and participant splits'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: validate_group_invariants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_group_invariants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_group_id text;
  group_creator_id text;
BEGIN
  IF TG_TABLE_NAME = 'group_members' THEN
    IF TG_OP = 'UPDATE'
       AND NEW."groupId" IS NOT DISTINCT FROM OLD."groupId"
       AND NEW."userId" IS NOT DISTINCT FROM OLD."userId"
       AND NEW."role" IS NOT DISTINCT FROM OLD."role"
       AND NEW."isActive" IS NOT DISTINCT FROM OLD."isActive" THEN
      RETURN NULL;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'groups' THEN
    target_group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    target_group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."groupId" ELSE NEW."groupId" END;
  END IF;
  SELECT "createdById" INTO group_creator_id FROM "groups" WHERE "id" = target_group_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM lock_group_invariants(target_group_id);

  IF NOT EXISTS (
    SELECT 1 FROM "group_members"
    WHERE "groupId" = target_group_id AND "userId" = group_creator_id
      AND "isActive" = true AND "role" = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'group creator must remain an active admin' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM "group_members"
      WHERE "groupId" = target_group_id AND "isActive" = true) > 100 THEN
    RAISE EXCEPTION 'group cannot have more than 100 active members' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "group_member_positions" position
    JOIN "group_members" membership
      ON membership."groupId" = position."groupId" AND membership."userId" = position."userId"
    WHERE position."groupId" = target_group_id
      AND membership."isActive" = false AND position."balance" <> 0
  ) THEN
    RAISE EXCEPTION 'inactive group member cannot have a balance' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "expenses" expense
    WHERE expense."groupId" = target_group_id AND (
      NOT EXISTS (SELECT 1 FROM "group_members" membership
        WHERE membership."groupId" = target_group_id AND membership."userId" = expense."paidById")
      OR NOT EXISTS (SELECT 1 FROM "group_members" membership
        WHERE membership."groupId" = target_group_id AND membership."userId" = expense."createdById")
    )
  ) OR EXISTS (
    SELECT 1 FROM "expense_splits" split
    JOIN "expenses" expense ON expense."id" = split."expenseId"
    WHERE expense."groupId" = target_group_id AND NOT EXISTS (
      SELECT 1 FROM "group_members" membership
      WHERE membership."groupId" = target_group_id AND membership."userId" = split."userId"
    )
  ) OR EXISTS (
    SELECT 1 FROM "settlements" settlement
    WHERE settlement."groupId" = target_group_id AND (
      NOT EXISTS (SELECT 1 FROM "group_members" membership
        WHERE membership."groupId" = target_group_id AND membership."userId" = settlement."fromUserId")
      OR NOT EXISTS (SELECT 1 FROM "group_members" membership
        WHERE membership."groupId" = target_group_id AND membership."userId" = settlement."toUserId")
    )
  ) THEN
    RAISE EXCEPTION 'financial participants must retain group membership history'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: validate_inactive_member_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_inactive_member_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_group_id text;
BEGIN
  target_group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."groupId" ELSE NEW."groupId" END;
  PERFORM lock_group_invariants(target_group_id);
  IF EXISTS (
    SELECT 1 FROM "group_member_positions" position
    JOIN "group_members" membership
      ON membership."groupId" = position."groupId" AND membership."userId" = position."userId"
    WHERE position."groupId" = target_group_id
      AND membership."isActive" = false AND position."balance" <> 0
  ) THEN
    RAISE EXCEPTION 'inactive group member cannot have a balance' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: validate_settlement_invariants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_settlement_invariants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  group_currency text;
  expense_payer_id text;
  expense_currency text;
  participant_amount integer;
  participant_amount_base integer;
  cash_amount_total bigint;
  cash_base_total bigint;
BEGIN
  PERFORM lock_group_invariants(NEW."groupId");

  SELECT "currency" INTO group_currency FROM "groups" WHERE "id" = NEW."groupId";
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "group_members"
    WHERE "groupId" = NEW."groupId" AND "userId" = NEW."fromUserId" AND "isActive" = true
  ) OR NOT EXISTS (
    SELECT 1 FROM "group_members"
    WHERE "groupId" = NEW."groupId" AND "userId" = NEW."toUserId" AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'settlement users must be active group members'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."expenseId" IS NULL THEN
    IF NEW."currency" <> group_currency OR NEW."amount" <> NEW."amountBase" THEN
      RAISE EXCEPTION 'manual settlement must use the group currency without conversion'
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  SELECT expense."paidById", expense."currency", split."amount", split."amountBase"
  INTO expense_payer_id, expense_currency, participant_amount, participant_amount_base
  FROM "expenses" expense
  LEFT JOIN "expense_splits" split
    ON split."expenseId" = expense."id" AND split."userId" = NEW."fromUserId"
  WHERE expense."id" = NEW."expenseId" AND expense."groupId" = NEW."groupId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement expense must belong to the same group'
      USING ERRCODE = '23514';
  END IF;
  IF expense_payer_id <> NEW."toUserId" OR participant_amount IS NULL THEN
    RAISE EXCEPTION 'cash settlement must go from an expense participant to its payer'
      USING ERRCODE = '23514';
  END IF;

  SELECT sum("amount"), sum("amountBase")
  INTO cash_amount_total, cash_base_total
  FROM "settlements"
  WHERE "expenseId" = NEW."expenseId" AND "fromUserId" = NEW."fromUserId";
  IF cash_base_total > participant_amount_base
      OR (NEW."currency" = expense_currency AND cash_amount_total > participant_amount) THEN
    RAISE EXCEPTION 'cash settlements cannot exceed the participant split'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE activity_log (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "actorId" text NOT NULL,
    type "ActivityType" NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    metadata jsonb NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE exchange_rates (
    id text NOT NULL,
    date date NOT NULL,
    currency text NOT NULL,
    rate numeric(20,10) NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT exchange_rates_currency_format_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT exchange_rates_rate_positive_check CHECK (rate > 0)
);


--
-- Name: expense_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE expense_splits (
    id text NOT NULL,
    "expenseId" text NOT NULL,
    "userId" text NOT NULL,
    amount integer NOT NULL,
    percentage integer,
    "amountBase" integer NOT NULL,
    CONSTRAINT "expense_splits_amountBase_positive_check" CHECK (("amountBase" > 0)),
    CONSTRAINT expense_splits_amount_positive_check CHECK ((amount > 0)),
    CONSTRAINT expense_splits_percentage_check CHECK (((percentage IS NULL) OR ((percentage >= 1) AND (percentage <= 10000))))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE expenses (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "paidById" text NOT NULL,
    "createdById" text NOT NULL,
    title text NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    category text,
    "splitType" "SplitType" DEFAULT 'EQUAL'::"SplitType" NOT NULL,
    date date NOT NULL,
    notes text,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "amountBase" integer NOT NULL,
    "customRate" numeric(20,10),
    CONSTRAINT "expenses_amountBase_positive_check" CHECK (("amountBase" > 0)),
    CONSTRAINT expenses_amount_positive_check CHECK ((amount > 0)),
    CONSTRAINT expenses_currency_format_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT "expenses_customRate_positive_check" CHECK (("customRate" IS NULL) OR ("customRate" > 0))
);


--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE feedbacks (
    id text NOT NULL,
    "userId" text NOT NULL,
    message text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: group_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE group_invites (
    id text NOT NULL,
    token text NOT NULL,
    "groupId" text NOT NULL,
    "createdById" text NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: group_member_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE group_member_positions (
    "groupId" text NOT NULL,
    "userId" text NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE group_members (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "userId" text NOT NULL,
    role "GroupMemberRole" DEFAULT 'MEMBER'::"GroupMemberRole" NOT NULL,
    "joinedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "bankName" text,
    "payeeAccount" text,
    "payeeName" text,
    "groupUpdatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE groups (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    type "GroupType" DEFAULT 'OTHER'::"GroupType" NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT groups_currency_format_check CHECK ((currency ~ '^[A-Z]{3}$'::text))
);


--
-- Name: idempotency_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE idempotency_records (
    id text NOT NULL,
    "principalId" text NOT NULL,
    operation "IdempotencyOperation" NOT NULL,
    key character varying(128) NOT NULL,
    "requestHash" character(64) NOT NULL,
    "resourceId" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) with time zone NOT NULL,
    CONSTRAINT idempotency_records_key_format_check CHECK (((length((key)::text) >= 8) AND ((key)::text ~ '^[A-Za-z0-9._:-]+$'::text))),
    CONSTRAINT idempotency_records_request_hash_check CHECK (("requestHash" ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT idempotency_records_resource_id_check CHECK ((length("resourceId") >= 1))
);


--
-- Name: settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE settlements (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "fromUserId" text NOT NULL,
    "toUserId" text NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    date date NOT NULL,
    notes text,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "amountBase" integer NOT NULL,
    "expenseId" text,
    CONSTRAINT "settlements_amountBase_positive_check" CHECK (("amountBase" > 0)),
    CONSTRAINT settlements_amount_positive_check CHECK ((amount > 0)),
    CONSTRAINT settlements_currency_format_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT settlements_distinct_users_check CHECK (("fromUserId" <> "toUserId"))
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_achievements (
    id text NOT NULL,
    "userId" text NOT NULL,
    "achievementId" text NOT NULL,
    "unlockedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "notifiedAt" timestamp(3) with time zone
);


--
-- Name: user_statistic_currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_statistic_currencies (
    "userId" text NOT NULL,
    currency text NOT NULL,
    "factCount" bigint NOT NULL,
    CONSTRAINT user_statistic_currencies_count_check CHECK (("factCount" > 0))
);


--
-- Name: user_statistic_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_statistic_facts (
    id text NOT NULL,
    "userId" text NOT NULL,
    kind text NOT NULL,
    reference text NOT NULL,
    value integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    currency text,
    CONSTRAINT user_statistic_facts_currency_format_check CHECK (((currency IS NULL) OR (currency ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT user_statistic_facts_kind_format_check CHECK ((kind ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)),
    CONSTRAINT user_statistic_facts_reference_not_empty_check CHECK (((length(reference) >= 1) AND (length(reference) <= 256))),
    CONSTRAINT user_statistic_facts_required_currency_check CHECK (((kind <> ALL (ARRAY['CURRENCY'::text, 'MONEY_SPENT'::text, 'MONEY_RETURNED'::text])) OR (currency IS NOT NULL))),
    CONSTRAINT user_statistic_facts_value_semantics_check CHECK (((value >= 0) AND ((kind <> ALL (ARRAY['MONEY_SPENT'::text, 'MONEY_RETURNED'::text])) OR (value > 0))))
);


--
-- Name: user_statistic_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_statistic_metrics (
    "userId" text NOT NULL,
    kind text NOT NULL,
    "factCount" bigint NOT NULL,
    "maxValue" integer NOT NULL,
    CONSTRAINT user_statistic_metrics_count_check CHECK (("factCount" > 0))
);


--
-- Name: user_statistic_money; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_statistic_money (
    "userId" text NOT NULL,
    kind text NOT NULL,
    currency text NOT NULL,
    "totalValue" bigint NOT NULL,
    CONSTRAINT user_statistic_money_total_check CHECK (("totalValue" > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE users (
    id text NOT NULL,
    email citext NOT NULL,
    name text NOT NULL,
    "avatarUrl" text,
    "passwordHash" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "bankName" text,
    "payeeAccount" text,
    "payeeName" text
);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: expense_splits expense_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expense_splits
    ADD CONSTRAINT expense_splits_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedbacks
    ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);


--
-- Name: group_invites group_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_invites
    ADD CONSTRAINT group_invites_pkey PRIMARY KEY (id);


--
-- Name: group_member_positions group_member_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_member_positions
    ADD CONSTRAINT group_member_positions_pkey PRIMARY KEY ("groupId", "userId");


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: idempotency_records idempotency_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY idempotency_records
    ADD CONSTRAINT idempotency_records_pkey PRIMARY KEY (id);


--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_statistic_currencies user_statistic_currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_currencies
    ADD CONSTRAINT user_statistic_currencies_pkey PRIMARY KEY ("userId", currency);


--
-- Name: user_statistic_facts user_statistic_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_facts
    ADD CONSTRAINT user_statistic_facts_pkey PRIMARY KEY (id);


--
-- Name: user_statistic_metrics user_statistic_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_metrics
    ADD CONSTRAINT user_statistic_metrics_pkey PRIMARY KEY ("userId", kind);


--
-- Name: user_statistic_money user_statistic_money_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_money
    ADD CONSTRAINT user_statistic_money_pkey PRIMARY KEY ("userId", kind, currency);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: activity_log_actorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_log_actorId_idx" ON activity_log USING btree ("actorId");


--
-- Name: activity_log_groupId_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_log_groupId_createdAt_id_idx" ON activity_log USING btree ("groupId", "createdAt" DESC, id DESC);


--
-- Name: exchange_rates_currency_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_currency_date_idx ON exchange_rates USING btree (currency, date DESC);


--
-- Name: exchange_rates_date_currency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exchange_rates_date_currency_key ON exchange_rates USING btree (date, currency);


--
-- Name: expense_splits_expenseId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expense_splits_expenseId_userId_key" ON expense_splits USING btree ("expenseId", "userId");


--
-- Name: expense_splits_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expense_splits_userId_idx" ON expense_splits USING btree ("userId");


--
-- Name: expenses_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_createdById_idx" ON expenses USING btree ("createdById");


--
-- Name: expenses_groupId_date_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_groupId_date_createdAt_id_idx" ON expenses USING btree ("groupId", date DESC, "createdAt" DESC, id DESC);


--
-- Name: expenses_paidById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_paidById_idx" ON expenses USING btree ("paidById");


--
-- Name: feedbacks_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "feedbacks_createdAt_id_idx" ON feedbacks USING btree ("createdAt" DESC, id DESC);


--
-- Name: feedbacks_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "feedbacks_userId_idx" ON feedbacks USING btree ("userId");


--
-- Name: group_invites_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_invites_createdById_idx" ON group_invites USING btree ("createdById");


--
-- Name: group_invites_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_invites_groupId_idx" ON group_invites USING btree ("groupId");


--
-- Name: group_invites_one_active_per_group_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX group_invites_one_active_per_group_key ON group_invites USING btree ("groupId") WHERE (revoked = false);


--
-- Name: group_invites_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX group_invites_token_key ON group_invites USING btree (token);


--
-- Name: group_member_positions_userId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_member_positions_userId_groupId_idx" ON group_member_positions USING btree ("userId", "groupId");


--
-- Name: group_members_groupId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "group_members_groupId_userId_key" ON group_members USING btree ("groupId", "userId");


--
-- Name: group_members_userId_isActive_groupUpdatedAt_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_members_userId_isActive_groupUpdatedAt_groupId_idx" ON group_members USING btree ("userId", "isActive", "groupUpdatedAt" DESC, "groupId" DESC);


--
-- Name: groups_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "groups_createdById_idx" ON groups USING btree ("createdById");


--
-- Name: idempotency_records_principalId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idempotency_records_principalId_expiresAt_idx" ON idempotency_records USING btree ("principalId", "expiresAt");


--
-- Name: idempotency_records_principalId_operation_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idempotency_records_principalId_operation_key_key" ON idempotency_records USING btree ("principalId", operation, key);


--
-- Name: settlements_expenseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "settlements_expenseId_idx" ON settlements USING btree ("expenseId");


--
-- Name: settlements_fromUserId_toUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "settlements_fromUserId_toUserId_idx" ON settlements USING btree ("fromUserId", "toUserId");


--
-- Name: settlements_groupId_date_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "settlements_groupId_date_createdAt_id_idx" ON settlements USING btree ("groupId", date DESC, "createdAt" DESC, id DESC);


--
-- Name: settlements_manual_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlements_manual_group_idx ON settlements USING btree ("groupId") WHERE ("expenseId" IS NULL);


--
-- Name: settlements_toUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "settlements_toUserId_idx" ON settlements USING btree ("toUserId");


--
-- Name: user_achievements_userId_achievementId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON user_achievements USING btree ("userId", "achievementId");


--
-- Name: user_achievements_userId_notifiedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_achievements_userId_notifiedAt_idx" ON user_achievements USING btree ("userId", "notifiedAt");


--
-- Name: user_statistic_facts_reference_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_statistic_facts_reference_kind_idx ON user_statistic_facts USING btree (reference, kind);


--
-- Name: user_statistic_facts_userId_kind_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_statistic_facts_userId_kind_reference_key" ON user_statistic_facts USING btree ("userId", kind, reference);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON users USING btree (email);


--
-- Name: users_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_name_trgm_idx ON users USING gin (name gin_trgm_ops);


--
-- Name: expense_splits 00_expense_splits_lock_group_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_expense_splits_lock_group_invariants" BEFORE INSERT OR DELETE OR UPDATE ON expense_splits FOR EACH ROW EXECUTE FUNCTION lock_financial_group_early();


--
-- Name: expenses 00_expenses_lock_group_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_expenses_lock_group_invariants" BEFORE INSERT OR DELETE OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION lock_financial_group_early();


--
-- Name: group_members 00_group_members_lock_group_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_group_members_lock_group_invariants" BEFORE INSERT OR DELETE OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION lock_financial_group_early();


--
-- Name: groups 00_groups_lock_group_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_groups_lock_group_invariants" BEFORE DELETE OR UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION lock_financial_group_early();


--
-- Name: settlements 00_settlements_lock_group_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "00_settlements_lock_group_invariants" BEFORE INSERT OR DELETE OR UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION lock_financial_group_early();


--
-- Name: expense_splits expense_splits_project_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_splits_project_position AFTER INSERT OR DELETE OR UPDATE ON expense_splits FOR EACH ROW EXECUTE FUNCTION project_expense_split_position();


--
-- Name: expense_splits expense_splits_validate_aggregate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER expense_splits_validate_aggregate AFTER INSERT OR DELETE OR UPDATE ON expense_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_invariants();


--
-- Name: expenses expenses_delete_children_for_projection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expenses_delete_children_for_projection BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION delete_expense_children_before_parent();


--
-- Name: expenses expenses_project_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expenses_project_position AFTER INSERT OR DELETE OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION project_expense_position();


--
-- Name: expenses expenses_protect_financial_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expenses_protect_financial_identity BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();


--
-- Name: expenses expenses_set_updatedAt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "expenses_set_updatedAt" BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();


--
-- Name: expenses expenses_validate_aggregate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER expenses_validate_aggregate AFTER INSERT OR UPDATE ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_invariants();


--
-- Name: group_member_positions group_member_positions_validate_inactive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER group_member_positions_validate_inactive AFTER INSERT OR DELETE OR UPDATE ON group_member_positions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inactive_member_position();


--
-- Name: group_members group_members_set_groupUpdatedAt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "group_members_set_groupUpdatedAt" BEFORE INSERT OR UPDATE OF "groupId", "groupUpdatedAt" ON group_members FOR EACH ROW EXECUTE FUNCTION set_group_member_group_updated_at();


--
-- Name: group_members group_members_validate_aggregate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER group_members_validate_aggregate AFTER INSERT OR DELETE OR UPDATE ON group_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_group_invariants();


--
-- Name: groups groups_project_member_updatedAt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "groups_project_member_updatedAt" AFTER UPDATE ON groups FOR EACH ROW WHEN ((old."updatedAt" IS DISTINCT FROM new."updatedAt")) EXECUTE FUNCTION project_group_updated_at_to_members();


--
-- Name: groups groups_protect_financial_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER groups_protect_financial_identity BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();


--
-- Name: groups groups_set_updatedAt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "groups_set_updatedAt" BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();


--
-- Name: groups groups_validate_aggregate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER groups_validate_aggregate AFTER INSERT OR UPDATE ON groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_group_invariants();


--
-- Name: settlements settlements_project_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settlements_project_position AFTER INSERT OR DELETE OR UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION project_settlement_position();


--
-- Name: settlements settlements_protect_financial_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settlements_protect_financial_identity BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();


--
-- Name: settlements settlements_validate_aggregate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER settlements_validate_aggregate AFTER INSERT OR UPDATE ON settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_invariants();


--
-- Name: user_statistic_facts user_statistic_facts_project; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_statistic_facts_project AFTER INSERT OR DELETE OR UPDATE ON user_statistic_facts FOR EACH ROW EXECUTE FUNCTION project_user_statistic_fact();


--
-- Name: users users_set_updatedAt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "users_set_updatedAt" BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();


--
-- Name: activity_log activity_log_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY activity_log
    ADD CONSTRAINT "activity_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: activity_log activity_log_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY activity_log
    ADD CONSTRAINT "activity_log_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expense_splits expense_splits_expenseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expense_splits
    ADD CONSTRAINT "expense_splits_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES expenses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expense_splits expense_splits_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expense_splits
    ADD CONSTRAINT "expense_splits_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: expenses expenses_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: expenses expenses_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT "expenses_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expenses expenses_paidById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT "expenses_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: feedbacks feedbacks_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedbacks
    ADD CONSTRAINT "feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: group_invites group_invites_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_invites
    ADD CONSTRAINT "group_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: group_invites group_invites_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_invites
    ADD CONSTRAINT "group_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: group_member_positions group_member_positions_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_member_positions
    ADD CONSTRAINT "group_member_positions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: group_member_positions group_member_positions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_member_positions
    ADD CONSTRAINT "group_member_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: group_members group_members_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_members
    ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: group_members group_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY group_members
    ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: groups groups_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY groups
    ADD CONSTRAINT "groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: idempotency_records idempotency_records_principalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY idempotency_records
    ADD CONSTRAINT "idempotency_records_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlements settlements_expenseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY settlements
    ADD CONSTRAINT "settlements_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES expenses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlements settlements_fromUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY settlements
    ADD CONSTRAINT "settlements_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: settlements settlements_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY settlements
    ADD CONSTRAINT "settlements_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlements settlements_toUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY settlements
    ADD CONSTRAINT "settlements_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_achievements user_achievements_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_achievements
    ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_statistic_currencies user_statistic_currencies_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_currencies
    ADD CONSTRAINT "user_statistic_currencies_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_statistic_facts user_statistic_facts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_facts
    ADD CONSTRAINT "user_statistic_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_statistic_metrics user_statistic_metrics_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_metrics
    ADD CONSTRAINT "user_statistic_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_statistic_money user_statistic_money_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_statistic_money
    ADD CONSTRAINT "user_statistic_money_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
