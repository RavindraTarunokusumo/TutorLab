import { NextResponse } from "next/server";
import { CourseSynthesisError, getCourseModelRepository, saveTeacherCourseModelRevision } from "@/lib/analysis/course-synthesis";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
  }
  if (error instanceof CourseSynthesisError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "STALE_COURSE_MODEL" ? 409 : error.code === "NO_ANALYSES" ? 404 : 422 });
  }
  throw error;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const version = await getCourseModelRepository().findLatest(projectId);
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ version });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const body = await request.json().catch(() => null);
    const version = await saveTeacherCourseModelRevision(projectId, body);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
