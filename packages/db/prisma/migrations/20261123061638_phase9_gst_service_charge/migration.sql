-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "serviceCharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxBreakup" JSONB;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "taxRatePercent" INTEGER;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "taxRatePercent" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "taxRatePercent" INTEGER;

-- AlterTable
ALTER TABLE "RestaurantProfile" ADD COLUMN     "fssai" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "upiName" TEXT;

-- CreateTable
CREATE TABLE "DayClose" (
    "id" TEXT NOT NULL,
    "businessDay" TIMESTAMP(3) NOT NULL,
    "expectedCashPaise" INTEGER NOT NULL DEFAULT 0,
    "expectedUpiPaise" INTEGER NOT NULL DEFAULT 0,
    "expectedCardPaise" INTEGER NOT NULL DEFAULT 0,
    "countedCashPaise" INTEGER NOT NULL DEFAULT 0,
    "variancePaise" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayClose_businessDay_key" ON "DayClose"("businessDay");
