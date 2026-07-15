ALTER TABLE "DocumentAnalysis"
ADD COLUMN "schemaVersion" TEXT NOT NULL DEFAULT '0.1',
ADD COLUMN "analysisProfile" TEXT NOT NULL DEFAULT 'course-model-v1';

DROP INDEX "DocumentAnalysis_documentId_documentHash_key";

CREATE UNIQUE INDEX "DocumentAnalysis_projectId_documentHash_schemaVersion_analysisProfile_key"
ON "DocumentAnalysis"("projectId", "documentHash", "schemaVersion", "analysisProfile");

CREATE UNIQUE INDEX "DocumentAnalysis_documentId_documentHash_schemaVersion_analysisProfile_key"
ON "DocumentAnalysis"("documentId", "documentHash", "schemaVersion", "analysisProfile");
