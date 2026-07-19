import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourseModelRepository } from "@/lib/analysis/course-synthesis";
import { generateTeacherRecommendations } from "@/lib/ai/pedagogical-advisor";
import { getEvaluationRun } from "@/lib/evaluation/runner";
import { getEvaluationRepository } from "@/lib/evaluation/repository";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import { getTutorRepository } from "@/lib/tutor/repository";
import { withOpenAIRequestKey } from "@/lib/ai/session-key";

const RequestSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(96),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tutorId: string; runId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId } = RequestSchema.parse(await request.json());
      await requireProjectAccess(request, projectId);
      const { tutorId, runId } = await params;
      const evaluation = await getEvaluationRun(projectId, runId);
      const tutor = await getTutorRepository().findVersion(projectId, tutorId);
      if (!evaluation || !tutor || evaluation.run.tutorVersionId !== tutorId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const existingRecommendations =
        evaluation.run.teacherRecommendations ?? [];
      if (existingRecommendations.length) {
        return NextResponse.json({ recommendations: existingRecommendations });
      }
      const warnings = evaluation.results.flatMap((result) =>
        (result.judgeResult?.warnings ?? []).map((warning) => ({
          scenarioId: result.scenarioId,
          message: warning.message,
        })),
      );
      if (!warnings.length) {
        return NextResponse.json(
          {
            error: "No pedagogical warnings are available for recommendations.",
          },
          { status: 409 },
        );
      }
      const courseModels = getCourseModelRepository();
      if (!courseModels.findById) {
        return NextResponse.json(
          { error: "Course model is unavailable." },
          { status: 404 },
        );
      }
      const courseModel = await courseModels.findById(
        projectId,
        tutor.courseModelVersionId,
      );
      if (!courseModel) {
        return NextResponse.json(
          { error: "Course model is unavailable." },
          { status: 404 },
        );
      }
      const recommendations = await generateTeacherRecommendations({
        tutorSpec: tutor.spec,
        sourceManifest: courseModel.artifact.sourceManifest,
        warnings,
      });
      await getEvaluationRepository().saveRun({
        ...evaluation.run,
        teacherRecommendations: recommendations,
      });
      return NextResponse.json({ recommendations });
    } catch (error) {
      if (error instanceof ProjectAccessError) {
        return NextResponse.json(
          { error: error.status === 401 ? "Unauthorized" : "Not found" },
          { status: error.status },
        );
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          { error: "Invalid recommendations request" },
          { status: 400 },
        );
      }
      throw error;
    }
  });
}
