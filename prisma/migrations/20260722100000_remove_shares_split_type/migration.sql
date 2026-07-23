-- Migrate any existing SHARES expenses to EQUAL before removing the enum value
UPDATE "expenses" SET "splitType" = 'EQUAL' WHERE "splitType" = 'SHARES';

-- Recreate SplitType enum without SHARES
-- The default is typed as the old enum too. Drop it before changing the
-- column type, then restore the same default after the conversion.
ALTER TABLE "expenses" ALTER COLUMN "splitType" DROP DEFAULT;
ALTER TYPE "SplitType" RENAME TO "SplitType_old";
CREATE TYPE "SplitType" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE');
ALTER TABLE "expenses" ALTER COLUMN "splitType" TYPE "SplitType" USING "splitType"::text::"SplitType";
ALTER TABLE "expenses" ALTER COLUMN "splitType" SET DEFAULT 'EQUAL';
DROP TYPE "SplitType_old";
