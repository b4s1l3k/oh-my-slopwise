-- Add ON DELETE CASCADE to expenses → groups FK
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_groupId_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add ON DELETE CASCADE to settlements → groups FK (nullable relation)
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_groupId_fkey";
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
