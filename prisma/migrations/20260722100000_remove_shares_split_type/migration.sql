-- Migrate any existing SHARES expenses to EQUAL before removing the enum value
UPDATE "expenses" SET "splitType" = 'EQUAL' WHERE "splitType" = 'SHARES';

-- Recreate SplitType enum without SHARES
ALTER TYPE "SplitType" RENAME TO "SplitType_old";
CREATE TYPE "SplitType" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE');
ALTER TABLE "expenses" ALTER COLUMN "splitType" TYPE "SplitType" USING "splitType"::text::"SplitType";
DROP TYPE "SplitType_old";
