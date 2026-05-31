-- CreateIndex
CREATE INDEX "ExpenseItem_reportId_idx" ON "ExpenseItem"("reportId");

-- CreateIndex
CREATE INDEX "ExpenseReport_ownerId_idx" ON "ExpenseReport"("ownerId");

-- CreateIndex
CREATE INDEX "ReportEvent_reportId_idx" ON "ReportEvent"("reportId");
