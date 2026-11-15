-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxRatePercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BillCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillCounter_pkey" PRIMARY KEY ("year")
);

