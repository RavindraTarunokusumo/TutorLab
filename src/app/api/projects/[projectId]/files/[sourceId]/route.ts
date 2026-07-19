import { NextResponse } from "next/server";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import {
  listSources,
  refreshSourceProcessing,
  removeSource,
  SourceNotFoundError,
} from "@/lib/sources/ingestion";
import { withOpenAIRequestKey } from "@/lib/ai/session-key";

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof SourceNotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw error;
}

async function requireSourceInProject(projectId: string, sourceId: string) {
  const sources = await listSources(projectId);
  if (!sources.some((source) => source.id === sourceId)) {
    throw new SourceNotFoundError();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sourceId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId, sourceId } = await params;
      await requireProjectAccess(request, projectId);
      await requireSourceInProject(projectId, sourceId);
      return NextResponse.json({
        source: await refreshSourceProcessing(sourceId),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sourceId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId, sourceId } = await params;
      await requireProjectAccess(request, projectId);
      await removeSource(projectId, sourceId);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
