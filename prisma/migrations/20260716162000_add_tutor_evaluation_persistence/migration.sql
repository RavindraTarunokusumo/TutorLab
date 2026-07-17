-- AlterEnum
ALTER TYPE "PipelineStage" ADD VALUE 'design';
ALTER TYPE "PipelineStage" ADD VALUE 'compile';
ALTER TYPE "PipelineStage" ADD VALUE 'scenario';
ALTER TYPE "PipelineStage" ADD VALUE 'evaluation';

-- CreateEnum
CREATE TYPE "TutorVersionStatus" AS ENUM ('compiling', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('teacher_preview', 'student');

-- CreateEnum
CREATE TYPE "ConversationMessageRole" AS ENUM ('learner', 'tutor');

-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "EvalReadiness" AS ENUM ('ready', 'ready_with_warnings', 'needs_revision', 'pending');

-- CreateEnum
CREATE TYPE "EvalResultStatus" AS ENUM ('not_run', 'running', 'passed', 'failed', 'error');

-- CreateTable
CREATE TABLE "TutorDesign" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "courseModelVersionId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "artifact" JSONB NOT NULL,
    "excludedOptions" JSONB NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "courseModelVersionId" TEXT NOT NULL,
    "selectedDesignId" TEXT NOT NULL,
    "selectedDesignIdentity" JSONB NOT NULL,
    "spec" JSONB NOT NULL,
    "compiledPrompt" TEXT NOT NULL,
    "status" "TutorVersionStatus" NOT NULL DEFAULT 'compiling',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compiledAt" TIMESTAMP(3),

    CONSTRAINT "TutorVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tutorVersionId" TEXT NOT NULL,
    "mode" "ConversationMode" NOT NULL,
    "currentState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ConversationMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalScenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tutorVersionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "artifact" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tutorVersionId" TEXT NOT NULL,
    "scenarioIds" JSONB NOT NULL,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'pending',
    "readiness" "EvalReadiness" NOT NULL DEFAULT 'pending',
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "evalRunId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "status" "EvalResultStatus" NOT NULL DEFAULT 'not_run',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "deterministicChecks" JSONB NOT NULL DEFAULT '[]',
    "judgeResult" JSONB,
    "usage" JSONB,
    "diagnostic" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseModelVersion_projectId_id_key" ON "CourseModelVersion"("projectId", "id");
CREATE UNIQUE INDEX "TutorDesign_projectId_id_key" ON "TutorDesign"("projectId", "id");
CREATE INDEX "TutorDesign_projectId_courseModelVersionId_idx" ON "TutorDesign"("projectId", "courseModelVersionId");
CREATE INDEX "TutorDesign_projectId_generationId_idx" ON "TutorDesign"("projectId", "generationId");
CREATE UNIQUE INDEX "TutorVersion_projectId_version_key" ON "TutorVersion"("projectId", "version");
CREATE UNIQUE INDEX "TutorVersion_projectId_id_key" ON "TutorVersion"("projectId", "id");
CREATE INDEX "TutorVersion_projectId_status_idx" ON "TutorVersion"("projectId", "status");
CREATE UNIQUE INDEX "Conversation_projectId_id_key" ON "Conversation"("projectId", "id");
CREATE INDEX "Conversation_projectId_tutorVersionId_mode_idx" ON "Conversation"("projectId", "tutorVersionId", "mode");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE UNIQUE INDEX "EvalScenario_projectId_id_key" ON "EvalScenario"("projectId", "id");
CREATE UNIQUE INDEX "EvalScenario_tutorVersionId_type_key" ON "EvalScenario"("tutorVersionId", "type");
CREATE INDEX "EvalScenario_projectId_tutorVersionId_idx" ON "EvalScenario"("projectId", "tutorVersionId");
CREATE UNIQUE INDEX "EvalRun_projectId_id_key" ON "EvalRun"("projectId", "id");
CREATE INDEX "EvalRun_projectId_tutorVersionId_createdAt_idx" ON "EvalRun"("projectId", "tutorVersionId", "createdAt");
CREATE UNIQUE INDEX "EvalResult_evalRunId_scenarioId_key" ON "EvalResult"("evalRunId", "scenarioId");
CREATE INDEX "EvalResult_projectId_evalRunId_idx" ON "EvalResult"("projectId", "evalRunId");

-- AddForeignKey
ALTER TABLE "TutorDesign" ADD CONSTRAINT "TutorDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutorDesign" ADD CONSTRAINT "TutorDesign_projectId_courseModelVersionId_fkey" FOREIGN KEY ("projectId", "courseModelVersionId") REFERENCES "CourseModelVersion"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TutorVersion" ADD CONSTRAINT "TutorVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutorVersion" ADD CONSTRAINT "TutorVersion_projectId_courseModelVersionId_fkey" FOREIGN KEY ("projectId", "courseModelVersionId") REFERENCES "CourseModelVersion"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TutorVersion" ADD CONSTRAINT "TutorVersion_projectId_selectedDesignId_fkey" FOREIGN KEY ("projectId", "selectedDesignId") REFERENCES "TutorDesign"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_tutorVersionId_fkey" FOREIGN KEY ("projectId", "tutorVersionId") REFERENCES "TutorVersion"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalScenario" ADD CONSTRAINT "EvalScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalScenario" ADD CONSTRAINT "EvalScenario_projectId_tutorVersionId_fkey" FOREIGN KEY ("projectId", "tutorVersionId") REFERENCES "TutorVersion"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_projectId_tutorVersionId_fkey" FOREIGN KEY ("projectId", "tutorVersionId") REFERENCES "TutorVersion"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_projectId_evalRunId_fkey" FOREIGN KEY ("projectId", "evalRunId") REFERENCES "EvalRun"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_projectId_scenarioId_fkey" FOREIGN KEY ("projectId", "scenarioId") REFERENCES "EvalScenario"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
