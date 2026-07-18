import { NextResponse } from "next/server";
import {
  CourseSynthesisError,
  getCourseModelRepository,
  synthesizeCourseModel,
} from "@/lib/analysis/course-synthesis";
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
    if (await getCourseModelRepository().findLatest(projectId)) {
      return NextResponse.json(
        { error: "A course model already exists for this project." },
        { status: 409 },
      );
    }
    const version = await synthesizeCourseModel(projectId);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
