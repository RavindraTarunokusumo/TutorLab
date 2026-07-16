-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('brief', 'sources', 'course_model', 'design', 'build', 'report', 'preview');

-- CreateEnum
CREATE TYPE "SourceRole" AS ENUM ('syllabus', 'lecture', 'exercise', 'assessment', 'rubric', 'solution', 'teacher_note', 'other');

-- CreateEnum
CREATE TYPE "SourceAuthority" AS ENUM ('teacher_instruction', 'course_authoritative', 'supplementary', 'observational');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('pending', 'in_progress', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('upload', 'extraction', 'analysis', 'synthesis');

-- CreateEnum
CREATE TYPE "PipelineJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'brief',
    "teachingBrief" JSONB NOT NULL DEFAULT '{}',
    "editTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModelVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "artifact" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "SourceRole" NOT NULL,
    "authority" "SourceAuthority" NOT NULL,
    "permissions" JSONB NOT NULL,
    "containsProtectedSolutions" BOOLEAN NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadStatus" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "extractionStatus" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "analysisStatus" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "pageCount" INTEGER,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "artifact" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "stage" "PipelineStage" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diagnostic" JSONB,
    "usage" JSONB,
    "latencyMs" INTEGER,
    "resultId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_editTokenHash_key" ON "Project"("editTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CourseModelVersion_projectId_version_key" ON "CourseModelVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "SourceDocument_projectId_idx" ON "SourceDocument"("projectId");

-- CreateIndex
CREATE INDEX "SourceDocument_projectId_contentHash_idx" ON "SourceDocument"("projectId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_projectId_id_key" ON "SourceDocument"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAnalysis_documentId_documentHash_key" ON "DocumentAnalysis"("documentId", "documentHash");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_projectId_idx" ON "DocumentAnalysis"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJob_projectId_stage_idempotencyKey_key" ON "PipelineJob"("projectId", "stage", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PipelineJob_sourceDocumentId_idx" ON "PipelineJob"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "CourseModelVersion" ADD CONSTRAINT "CourseModelVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_projectId_documentId_fkey" FOREIGN KEY ("projectId", "documentId") REFERENCES "SourceDocument"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_projectId_sourceDocumentId_fkey" FOREIGN KEY ("projectId", "sourceDocumentId") REFERENCES "SourceDocument"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
