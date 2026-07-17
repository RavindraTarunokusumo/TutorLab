ALTER TABLE "Conversation"
  ADD COLUMN "previewClaimToken" TEXT,
  ADD COLUMN "previewClaimedAt" TIMESTAMP(3);

CREATE INDEX "Conversation_projectId_tutorVersionId_mode_previewClaimedAt_idx"
  ON "Conversation"("projectId", "tutorVersionId", "mode", "previewClaimedAt");
