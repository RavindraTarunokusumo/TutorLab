import { NextResponse } from "next/server";
import { z } from "zod";
import { getTutorRepository } from "@/lib/tutor/repository";
import {
  generateEvaluationScenarios,
  findLatestScenarioJob,
  listEvaluationScenarios,
  ScenarioGenerationError,
} from "@/lib/evaluation/scenarios";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";

const ScenarioRequestSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(96),
  idempotencyKey: z.string().trim().min(1).max(160),
});

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof ScenarioGenerationError) {
    const status =
      error.code === "NO_ACTIVE_TUTOR"
        ? 404
        : error.code === "STALE_COURSE_MODEL" ||
            error.code === "IDEMPOTENCY_KEY_REUSED"
          ? 409
          : error.code === "TRANSIENT_FAILURE"
            ? 503
            : 422;
    return NextResponse.json(
      { error: "Evaluation scenarios could not be generated.", code: error.code },
      { status },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid scenario request" }, { status: 400 });
  }
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tutorId: string }> },
) {
  try {
    const body = ScenarioRequestSchema.parse(await request.json());
    const project = await requireProjectAccess(request, body.projectId);
    const { tutorId } = await params;
    const result = await generateEvaluationScenarios({
      project,
      tutorVersionId: tutorId,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(
      { job: result.job, scenarios: result.scenarios },
      { status: result.job.status === "completed" ? 201 : 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tutorId: string }> },
) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "Invalid scenario request" }, { status: 400 });
    }
    await requireProjectAccess(request, projectId);
    const { tutorId } = await params;
    const tutor = await getTutorRepository().findVersion(projectId, tutorId);
    if (!tutor) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      scenarios: await listEvaluationScenarios(projectId, tutorId),
      job: await findLatestScenarioJob(projectId, tutorId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
