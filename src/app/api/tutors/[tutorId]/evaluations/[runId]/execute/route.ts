import { NextResponse } from "next/server";
import { z } from "zod";
import { EvaluationRunError, getEvaluationRun, runTutorEvaluation } from "@/lib/evaluation/runner";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

const ResumeSchema = z.strictObject({ projectId: z.string().trim().min(1).max(96), idempotencyKey: z.string().trim().min(1).max(160) });

export async function POST(request: Request, { params }: { params: Promise<{ tutorId: string; runId: string }> }) {
  try {
    const body = ResumeSchema.parse(await request.json());
    await requireProjectAccess(request, body.projectId);
    const { tutorId, runId } = await params;
    const persisted = await getEvaluationRun(body.projectId, runId);
    if (!persisted || persisted.run.tutorVersionId !== tutorId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await runTutorEvaluation({ ...body, tutorVersionId: tutorId, scenarioIds: persisted.run.scenarioIds, resume: true }));
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
    if (error instanceof EvaluationRunError) return NextResponse.json({ error: "Idempotency key cannot be reused for a different evaluation request.", code: error.code }, { status: 409 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid evaluation request" }, { status: 400 });
    throw error;
  }
}
