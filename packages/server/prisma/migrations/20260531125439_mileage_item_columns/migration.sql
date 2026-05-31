-- AlterTable
ALTER TABLE "ExpenseItem" ADD COLUMN     "baselineKm" INTEGER,
ADD COLUMN     "destinationAddress" TEXT,
ADD COLUMN     "enteredKm" INTEGER,
ADD COLUMN     "originAddress" TEXT,
ADD COLUMN     "overageJustification" TEXT,
ADD COLUMN     "ratePerKm" DECIMAL(8,4),
ADD COLUMN     "roundTrip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeProvider" TEXT,
ADD COLUMN     "tolerancePercent" INTEGER,
ADD COLUMN     "vehicleId" TEXT;

-- CreateIndex
CREATE INDEX "ExpenseItem_vehicleId_idx" ON "ExpenseItem"("vehicleId");

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
