import { NextResponse } from "next/server";
import { getCourseModelRepository } from "@/lib/analysis/course-synthesis";
import { getProjectRepository } from "@/lib/projects/repository";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const courseModel = await getCourseModelRepository().findLatest(projectId);
    if (!courseModel) {
      return NextResponse.json(
        { error: "Generate a course model before continuing to design." },
        { status: 409 },
      );
    }
    const project = await getProjectRepository().updateStage(projectId, "design");
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json(
        { error: error.status === 401 ? "Unauthorized" : "Not found" },
        { status: error.status },
      );
    }
    throw error;
  }
}
