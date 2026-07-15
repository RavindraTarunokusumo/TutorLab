import { NextResponse } from "next/server";
import { DocumentAnalysisError, retryDocumentAnalysis } from "@/lib/analysis/document-analysis";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
  }
  if (error instanceof DocumentAnalysisError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "SOURCE_NOT_READY" ? 404 : 409 });
  }
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sourceId: string }> },
) {
  try {
    const { projectId, sourceId } = await params;
    await requireProjectAccess(request, projectId);
    const job = await retryDocumentAnalysis(projectId, sourceId);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
