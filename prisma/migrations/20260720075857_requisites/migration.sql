-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "payeeAccount" TEXT,
ADD COLUMN     "payeeName" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "payeeAccount" TEXT,
ADD COLUMN     "payeeName" TEXT;
