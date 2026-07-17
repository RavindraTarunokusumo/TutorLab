import { NextResponse } from "next/server";
import { getProjectRepository } from "@/lib/projects/repository";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";
import { getSourceRepository } from "@/lib/sources/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const sources = await getSourceRepository().list(projectId);
    const analyzable = sources.filter(
      (source) =>
        source.processing.extractionStatus === "ready" &&
        source.permissions.useForCourseModel,
    );
    if (
      analyzable.length === 0 ||
      analyzable.some((source) => source.processing.analysisStatus !== "ready")
    ) {
      return NextResponse.json(
        { error: "Analyze all ready course sources before continuing." },
        { status: 409 },
      );
    }
    const project = await getProjectRepository().updateStage(
      projectId,
      "course_model",
    );
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
