-- TEMPORARY PRODUCTION RECOVERY
--
-- The original 20260722100000_remove_shares_split_type migration renamed the
-- enum before dropping the column default. PostgreSQL then failed to cast the
-- default and could leave both SplitType_old and SplitType behind. This script
-- repairs only that known state. It never deletes expenses or expense splits.

SET lock_timeout = '10s';
SET statement_timeout = '60s';
LOCK TABLE "expenses" IN ACCESS EXCLUSIVE MODE;

DO $recovery$
DECLARE
    failed_attempts INTEGER;
    column_type TEXT;
    has_split_type BOOLEAN;
    has_split_type_old BOOLEAN;
    split_type_has_shares BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO failed_attempts
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260722100000_remove_shares_split_type'
      AND "finished_at" IS NULL
      AND "rolled_back_at" IS NULL;

    IF failed_attempts = 0 THEN
        RETURN;
    END IF;

    SELECT t.typname INTO column_type
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'expenses'::regclass
      AND a.attname = 'splitType'
      AND NOT a.attisdropped;

    SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'SplitType' AND n.nspname = current_schema()
    ) INTO has_split_type;
    SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'SplitType_old' AND n.nspname = current_schema()
    ) INTO has_split_type_old;

    IF column_type = 'SplitType_old' THEN
        IF NOT has_split_type_old THEN
            RAISE EXCEPTION 'Recovery refused: expenses.splitType references a missing SplitType_old';
        END IF;

        -- State left by the original failed migration: the column still uses
        -- the old enum and the newly-created enum is not attached to data.
        IF has_split_type THEN
            DROP TYPE "SplitType";
        END IF;
        ALTER TYPE "SplitType_old" RENAME TO "SplitType";
        ALTER TABLE "expenses" ALTER COLUMN "splitType" DROP DEFAULT;
        ALTER TABLE "expenses" ALTER COLUMN "splitType" SET DEFAULT 'EQUAL'::"SplitType";

        UPDATE "_prisma_migrations"
        SET "rolled_back_at" = now(),
            "logs" = concat_ws(E'\n', "logs", 'SLOPwise automatic recovery: restored the pre-migration enum state')
        WHERE "migration_name" = '20260722100000_remove_shares_split_type'
          AND "finished_at" IS NULL
          AND "rolled_back_at" IS NULL;

    ELSIF column_type = 'SplitType' THEN
        IF NOT has_split_type THEN
            RAISE EXCEPTION 'Recovery refused: expenses.splitType references a missing SplitType';
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'SplitType'
              AND n.nspname = current_schema()
              AND e.enumlabel = 'SHARES'
        ) INTO split_type_has_shares;

        IF split_type_has_shares AND has_split_type_old THEN
            RAISE EXCEPTION 'Recovery refused: ambiguous SplitType and SplitType_old state';
        ELSIF split_type_has_shares THEN
            -- PostgreSQL rolled the DDL back, but Prisma retained a failed row.
            ALTER TABLE "expenses" ALTER COLUMN "splitType" DROP DEFAULT;
            ALTER TABLE "expenses" ALTER COLUMN "splitType" SET DEFAULT 'EQUAL'::"SplitType";
            UPDATE "_prisma_migrations"
            SET "rolled_back_at" = now(),
                "logs" = concat_ws(E'\n', "logs", 'SLOPwise automatic recovery: schema was already in the pre-migration state')
            WHERE "migration_name" = '20260722100000_remove_shares_split_type'
              AND "finished_at" IS NULL
              AND "rolled_back_at" IS NULL;
        ELSE
            -- The enum conversion finished and only migration bookkeeping was
            -- interrupted. Remove an unused leftover old enum if it exists.
            IF has_split_type_old THEN
                DROP TYPE "SplitType_old";
            END IF;
            ALTER TABLE "expenses" ALTER COLUMN "splitType" DROP DEFAULT;
            ALTER TABLE "expenses" ALTER COLUMN "splitType" SET DEFAULT 'EQUAL'::"SplitType";
            UPDATE "_prisma_migrations"
            SET "finished_at" = now(),
                "applied_steps_count" = 1,
                "logs" = concat_ws(E'\n', "logs", 'SLOPwise automatic recovery: enum conversion was already complete')
            WHERE "migration_name" = '20260722100000_remove_shares_split_type'
              AND "finished_at" IS NULL
              AND "rolled_back_at" IS NULL;
        END IF;
    ELSE
        RAISE EXCEPTION 'Recovery refused: unexpected expenses.splitType type %', column_type;
    END IF;
END
$recovery$;
