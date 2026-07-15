ALTER TABLE "Project" ADD COLUMN "vectorStoreId" TEXT;
ALTER TABLE "Project" ADD COLUMN "vectorStoreProvisioningToken" TEXT;
ALTER TABLE "Project" ADD COLUMN "vectorStoreProvisioningStartedAt" TIMESTAMP(3);
ALTER TABLE "SourceDocument" ADD COLUMN "openaiFileId" TEXT;
ALTER TABLE "SourceDocument" ADD COLUMN "requiresExtractionMetrics" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Project_vectorStoreId_key" ON "Project"("vectorStoreId");
CREATE UNIQUE INDEX "SourceDocument_openaiFileId_key" ON "SourceDocument"("openaiFileId");
