import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EvaluationRunError,
  getEvaluationRun,
  runTutorEvaluation,
} from "@/lib/evaluation/runner";
import { getTutorRepository } from "@/lib/tutor/repository";
import { getEvaluationRepository } from "@/lib/evaluation/repository";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import { withOpenAIRequestKey } from "@/lib/ai/session-key";

const RequestSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(96),
  idempotencyKey: z.string().trim().min(1).max(160),
  scenarioIds: z
    .array(z.string().trim().min(1).max(96))
    .min(1)
    .max(6)
    .optional(),
});

function failure(error: unknown) {
  if (error instanceof ProjectAccessError)
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  if (error instanceof EvaluationRunError)
    return NextResponse.json(
      {
        error:
          "Idempotency key cannot be reused for a different evaluation request.",
        code: error.code,
      },
      { status: 409 },
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Invalid evaluation request" },
      { status: 400 },
    );
  if (error instanceof Error && /not found|unavailable/i.test(error.message))
    return NextResponse.json(
      { error: "Evaluation data is unavailable" },
      { status: 404 },
    );
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tutorId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const input = RequestSchema.parse(await request.json());
      await requireProjectAccess(request, input.projectId);
      const { tutorId } = await params;
      return NextResponse.json(
        await runTutorEvaluation({
          ...input,
          tutorVersionId: tutorId,
          startOnly: true,
        }),
        { status: 202 },
      );
    } catch (error) {
      return failure(error);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tutorId: string }> },
) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const runId = new URL(request.url).searchParams.get("runId");
    if (!projectId)
      return NextResponse.json(
        { error: "Invalid evaluation request" },
        { status: 400 },
      );
    await requireProjectAccess(request, projectId);
    const { tutorId } = await params;
    const evaluation = runId
      ? await getEvaluationRun(projectId, runId)
      : await (async () => {
          const run = await getEvaluationRepository().findLatestRun(
            projectId,
            tutorId,
          );
          return run ? getEvaluationRun(projectId, run.id) : null;
        })();
    if (!evaluation || evaluation.run.tutorVersionId !== tutorId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const tutor = await getTutorRepository().findVersion(projectId, tutorId);
    return tutor
      ? NextResponse.json(evaluation)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
