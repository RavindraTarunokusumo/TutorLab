ALTER TABLE "SourceDocument" ADD COLUMN "extractedTokenCount" INTEGER;

DROP INDEX "SourceDocument_projectId_contentHash_idx";
CREATE UNIQUE INDEX "SourceDocument_projectId_contentHash_key" ON "SourceDocument"("projectId", "contentHash");
