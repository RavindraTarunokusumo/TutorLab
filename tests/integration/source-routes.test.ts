// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
const ingestion = vi.hoisted(() => ({
  ingestSource: vi.fn(),
  listSources: vi.fn(),
  refreshSourceProcessing: vi.fn(),
  removeSource: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects/service", () => ({
  ProjectAccessError: class ProjectAccessError extends Error {
    constructor(readonly status: 401 | 404) {
      super("access");
    }
  },
  requireProjectAccess: auth.requireProjectAccess,
}));
vi.mock("@/lib/sources/ingestion", async () => {
  return {
    ...ingestion,
    SourceNotFoundError: class SourceNotFoundError extends Error {},
    parseSourceUploadMetadata: (input: unknown) => {
      if (!input || typeof input !== "object" || !("role" in input)) {
        throw new TypeError("Invalid source metadata");
      }
      return input;
    },
  };
});

const source = {
  id: "source-alpha",
  projectId: "project-alpha",
  name: "notes.md",
  role: "lecture",
  authority: "course_authoritative",
  permissions: {
    useForCourseModel: true,
    useForPedagogyDrafting: true,
    useForRuntimeRetrieval: false,
    useForEvaluation: true,
    revealExcerptsToStudents: false,
  },
  containsProtectedSolutions: false,
  contentHash: "a".repeat(64),
  mimeType: "text/markdown",
  sizeBytes: 5,
  processing: {
    uploadStatus: "ready",
    extractionStatus: "ready",
    analysisStatus: "pending",
  },
};

function multipartRequest(metadata: string): Request {
  const file = {
    name: "notes.md",
    type: "text/markdown",
    size: 5,
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("notes").buffer),
  };
  return {
    headers: new Headers(),
    formData: vi.fn().mockResolvedValue({
      get: (name: string) => (name === "file" ? file : metadata),
    }),
  } as unknown as Request;
}

describe("source API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireProjectAccess.mockResolvedValue({ id: "project-alpha" });
  });

  it(
    "accepts multipart metadata after edit authorization and returns no provider identifiers",
    async () => {
    ingestion.ingestSource.mockResolvedValue(source);
    const request = multipartRequest(
      JSON.stringify({
        role: "lecture",
        authority: "course_authoritative",
        permissions: source.permissions,
        containsProtectedSolutions: false,
      }),
    );
    const { POST } = await import("@/app/api/projects/[projectId]/files/route");

    const response = await POST(
      request,
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(auth.requireProjectAccess).toHaveBeenCalled();
    expect(ingestion.ingestSource).toHaveBeenCalledWith(
      "project-alpha",
      expect.objectContaining({ name: "notes.md", mimeType: "text/markdown" }),
      expect.objectContaining({ role: "lecture" }),
    );
    expect(body).toEqual({ source });
    expect(JSON.stringify(body)).not.toContain("openaiFileId");
      expect(JSON.stringify(body)).not.toContain("vectorStoreId");
    },
    15_000,
  );

  it("rejects invalid multipart metadata before source ingestion", async () => {
    const request = multipartRequest("{}");
    const { POST } = await import("@/app/api/projects/[projectId]/files/route");

    const response = await POST(
      request,
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(400);
    expect(ingestion.ingestSource).not.toHaveBeenCalled();
  });

  it("rejects an oversized content-length before parsing multipart form data", async () => {
    const formData = vi.fn();
    const { POST } = await import("@/app/api/projects/[projectId]/files/route");

    const response = await POST(
      {
        headers: new Headers({ "content-length": String(51 * 1024 * 1024) }),
        formData,
      } as unknown as Request,
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(400);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects an oversized multipart file before reading its bytes", async () => {
    const arrayBuffer = vi.fn();
    const request = {
      headers: new Headers(),
      formData: vi.fn().mockResolvedValue({
        get: (name: string) =>
          name === "file"
            ? {
                name: "large.md",
                type: "text/markdown",
                size: 51 * 1024 * 1024,
                arrayBuffer,
              }
            : JSON.stringify({ role: "lecture" }),
      }),
    } as unknown as Request;
    const { POST } = await import("@/app/api/projects/[projectId]/files/route");

    const response = await POST(
      request,
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(400);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("lists and deletes sources only after edit authorization", async () => {
    ingestion.listSources.mockResolvedValue([source]);
    const listRoute = await import("@/app/api/projects/[projectId]/files/route");
    const itemRoute = await import(
      "@/app/api/projects/[projectId]/files/[sourceId]/route"
    );

    const listed = await listRoute.GET(
      new Request("http://localhost/api/projects/project-alpha/files"),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    const deleted = await itemRoute.DELETE(
      new Request("http://localhost/api/projects/project-alpha/files/source-alpha", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ projectId: "project-alpha", sourceId: "source-alpha" }) },
    );

    expect(await listed.json()).toEqual({ sources: [source] });
    expect(deleted.status).toBe(204);
    expect(ingestion.removeSource).toHaveBeenCalledWith("project-alpha", "source-alpha");
  });
});
