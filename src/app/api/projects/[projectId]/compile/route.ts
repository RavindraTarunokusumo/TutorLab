import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import { TutorDesignControlsSchema } from "@/lib/schemas";
import {
  compileTutor,
  findActiveTutorVersion,
  TutorCompilationError,
} from "@/lib/tutor/compiler";

const CompileRequestSchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1).max(160),
  designId: z.string().trim().min(1).max(96),
  controls: TutorDesignControlsSchema,
  courseModelVersionId: z.string().trim().min(1).max(96).optional(),
});

function serializableVersion(version: Awaited<ReturnType<typeof findActiveTutorVersion>>) {
  if (!version) return null;
  return {
    id: version.id,
    projectId: version.projectId,
    version: version.version,
    courseModelVersionId: version.courseModelVersionId,
    selectedDesignId: version.selectedDesignId,
    selectedDesignIdentity: version.selectedDesignIdentity,
    spec: version.spec,
    status: version.status,
    createdAt: version.createdAt.toISOString(),
    compiledAt: version.compiledAt?.toISOString() ?? null,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof TutorCompilationError) {
    const status =
      error.code === "COURSE_MODEL_NOT_FOUND" ||
      error.code === "DESIGN_NOT_FOUND"
        ? 404
        : error.code === "STALE_COURSE_MODEL" ||
            error.code === "STALE_DESIGN" ||
            error.code === "INCOMPLETE_TEACHING_BRIEF" ||
            error.code === "NO_RUNTIME_SOURCES" ||
            error.code === "NO_PEDAGOGY_SOURCES" ||
            error.code === "IDEMPOTENCY_KEY_REUSED"
          ? 409
          : error.code === "TRANSIENT_FAILURE"
            ? 503
            : 422;
    return NextResponse.json(
      { error: "Tutor compilation could not be completed.", code: error.code },
      { status },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid compile request" }, { status: 400 });
  }
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const project = await requireProjectAccess(request, projectId);
    const body = CompileRequestSchema.parse(await request.json());
    const result = await compileTutor({ project, ...body });
    return NextResponse.json(
      {
        job: result.job,
        tutorVersion: serializableVersion(result.tutorVersion),
      },
      { status: result.job.status === "completed" ? 201 : 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    return NextResponse.json({
      tutorVersion: serializableVersion(await findActiveTutorVersion(projectId)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
