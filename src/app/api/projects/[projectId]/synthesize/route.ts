import { NextResponse } from "next/server";
import { CourseSynthesisError, synthesizeCourseModel } from "@/lib/analysis/course-synthesis";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
  }
  if (error instanceof CourseSynthesisError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NO_ANALYSES" || error.code === "TEACHER_EDITS_REQUIRE_CONFIRMATION" ? 409 : 422 });
  }
  throw error;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const body = await request.json().catch(() => ({}));
    const discardTeacherEdits = body !== null && typeof body === "object" && "discardTeacherEdits" in body && body.discardTeacherEdits === true;
    const version = await synthesizeCourseModel(projectId, { discardTeacherEdits });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
