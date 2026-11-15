-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "zoneId" TEXT;

-- CreateIndex
CREATE INDEX "Session_zoneId_idx" ON "Session"("zoneId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

