-- AlterTable
ALTER TABLE "expense_splits" ADD COLUMN     "amountBase" INTEGER;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "amountBase" INTEGER;

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "amountBase" INTEGER;

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_date_currency_key" ON "exchange_rates"("date", "currency");
