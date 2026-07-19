ALTER TABLE "EvalRun"
ADD COLUMN "teacherRecommendations" JSONB NOT NULL DEFAULT '[]';
