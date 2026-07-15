import { NextResponse } from "next/server";
import { getPipelineJobRepository } from "@/lib/jobs/repository";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "Invalid job request" }, { status: 400 });
    await requireProjectAccess(request, projectId);
    const job = await getPipelineJobRepository().findById(projectId, (await params).jobId);
    return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
    }
    throw error;
  }
}
