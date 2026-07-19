import { NextResponse } from "next/server";
import { getProjectRepository } from "@/lib/projects/repository";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const project = await getProjectRepository().updateStage(projectId, "export");
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
