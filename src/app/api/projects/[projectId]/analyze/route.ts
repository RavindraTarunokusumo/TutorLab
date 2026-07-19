import { NextResponse } from "next/server";
import {
  DocumentAnalysisError,
  analyzePendingDocuments,
} from "@/lib/analysis/document-analysis";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import { withOpenAIRequestKey } from "@/lib/ai/session-key";

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof DocumentAnalysisError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 409 },
    );
  }
  throw error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId } = await params;
      await requireProjectAccess(request, projectId);
      const job = await analyzePendingDocuments(projectId);
      return NextResponse.json({ job }, { status: 202 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
