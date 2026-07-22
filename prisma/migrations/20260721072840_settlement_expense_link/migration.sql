-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "expenseId" TEXT;

-- CreateIndex
CREATE INDEX "settlements_expenseId_idx" ON "settlements"("expenseId");

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
