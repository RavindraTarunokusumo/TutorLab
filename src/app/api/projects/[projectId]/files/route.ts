import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ProjectAccessError,
  requireProjectAccess,
} from "@/lib/projects/service";
import { DEFAULT_WORKSPACE_BUDGET } from "@/lib/schemas";
import {
  ingestSource,
  listSources,
  parseSourceUploadMetadata,
} from "@/lib/sources/ingestion";
import { SourceValidationError } from "@/lib/sources/validation";
import {
  withOpenAIRequestKey,
  withOptionalOpenAIRequestKey,
} from "@/lib/ai/session-key";

function invalidRequest() {
  return NextResponse.json({ error: "Invalid source upload" }, { status: 400 });
}

function errorResponse(error: unknown) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Not found" },
      { status: error.status },
    );
  }
  if (error instanceof SourceValidationError) {
    return NextResponse.json(
      { error: error.safeMessage, code: error.code },
      { status: 400 },
    );
  }
  if (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof TypeError
  ) {
    return invalidRequest();
  }
  throw error;
}

function parseMetadata(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    throw new TypeError("Missing source metadata");
  }
  return parseSourceUploadMetadata(JSON.parse(value));
}

const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function exceedsBodyPreflight(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) {
    return false;
  }
  return (
    Number(contentLength) >
    DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile + MAX_MULTIPART_OVERHEAD_BYTES
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return withOpenAIRequestKey(request, async () => {
    try {
      const { projectId } = await params;
      await requireProjectAccess(request, projectId);
      if (exceedsBodyPreflight(request)) {
        throw new SourceValidationError(
          "FILE_SIZE_LIMIT_EXCEEDED",
          "This file exceeds the per-file size limit.",
        );
      }
      const formData = await request.formData();
      const file = formData.get("file");
      if (
        !file ||
        typeof file === "string" ||
        typeof file.arrayBuffer !== "function" ||
        !file.name ||
        !file.type ||
        !Number.isSafeInteger(file.size)
      ) {
        throw new TypeError("Missing source file");
      }
      if (
        file.type !== "application/pdf" ||
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        throw new SourceValidationError(
          "UNSUPPORTED_FILE_TYPE",
          "Only PDF files are supported.",
        );
      }
      if (file.size > DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile) {
        throw new SourceValidationError(
          "FILE_SIZE_LIMIT_EXCEEDED",
          "This file exceeds the per-file size limit.",
        );
      }
      const metadata = parseMetadata(formData.get("metadata"));
      const source = await ingestSource(
        projectId,
        {
          name: file.name,
          mimeType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        metadata,
      );
      return NextResponse.json({ source }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return withOptionalOpenAIRequestKey(request, async () => {
    try {
      const { projectId } = await params;
      await requireProjectAccess(request, projectId);
      return NextResponse.json({ sources: await listSources(projectId) });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
