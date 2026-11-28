-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "linesSnapshot" JSONB,
ALTER COLUMN "billNumber" DROP NOT NULL;

-- Existing issued and paid bills keep their number and are marked issued.
UPDATE "Bill" SET "issuedAt" = COALESCE("paidAt", "createdAt") WHERE "issuedAt" IS NULL;

-- CreateTable
CREATE TABLE "FinancialYearBillCounter" (
    "fy" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialYearBillCounter_pkey" PRIMARY KEY ("fy")
);
