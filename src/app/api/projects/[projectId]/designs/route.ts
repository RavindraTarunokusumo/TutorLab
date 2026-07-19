import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import {
  generateTutorDesigns,
  listLatestTutorDesigns,
  TutorDesignGenerationError,
} from "@/lib/tutor/architect";
import { getCourseModelRepository } from "@/lib/analysis/course-synthesis";
import { withOpenAIRequestKey } from "@/lib/ai/session-key";

const DesignRequestSchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1).max(160),
  courseModelVersionId: z.string().trim().min(1).max(96).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof TutorDesignGenerationError) {
    const status =
      error.code === "COURSE_MODEL_NOT_FOUND"
        ? 404
        : error.code === "INCOMPLETE_TEACHING_BRIEF"
          ? 409
          : error.code === "TRANSIENT_FAILURE"
            ? 503
            : 422;
    return NextResponse.json(
      { error: "Tutor designs could not be generated.", code: error.code },
      { status },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid design request" },
      { status: 400 },
    );
  }
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId } = await params;
      const project = await requireProjectAccess(request, projectId);
      const body = DesignRequestSchema.parse(await request.json());
      const result = await generateTutorDesigns({
        project,
        idempotencyKey: body.idempotencyKey,
        courseModelVersionId: body.courseModelVersionId,
      });
      return NextResponse.json(
        {
          job: result.job,
          designs: result.designs.map(({ artifact }) => artifact),
        },
        {
          status: result.job.status === "completed" ? 201 : 202,
        },
      );
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const courseModel = await getCourseModelRepository().findLatest(projectId);
    if (!courseModel) return NextResponse.json({ designs: [] });
    const designs = await listLatestTutorDesigns(projectId, courseModel.id);
    return NextResponse.json({
      designs: designs.map(({ artifact }) => artifact),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
