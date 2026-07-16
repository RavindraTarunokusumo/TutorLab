import { describe, expect, it, vi } from "vitest";
import type {
  OpenAIFileProvider,
  VectorStoreFileProgress,
} from "@/lib/ai/openai-files";
import type { ProjectRepository } from "@/lib/projects/repository";
import type { SourceDocument } from "@/lib/schemas";
import {
  ingestSource,
  refreshSourceProcessing,
  removeSource,
} from "@/lib/sources/ingestion";
import type {
  ProviderSourceDocument,
  SourceIngestionUpdate,
  SourceRepository,
} from "@/lib/sources/repository";

vi.mock("server-only", () => ({}));

const permissions = {
  useForCourseModel: true,
  useForPedagogyDrafting: true,
  useForRuntimeRetrieval: false,
  useForEvaluation: true,
  revealExcerptsToStudents: false,
};

function storedSource(overrides: Partial<ProviderSourceDocument> = {}): ProviderSourceDocument {
  return {
    source: {
      id: "source-alpha",
      projectId: "project-alpha",
      name: "notes.md",
      role: "lecture",
      authority: "course_authoritative",
      permissions,
      containsProtectedSolutions: false,
      contentHash: "a".repeat(64),
      mimeType: "text/markdown",
      sizeBytes: 12,
      processing: {
        uploadStatus: "ready",
        extractionStatus: "failed",
        analysisStatus: "pending",
        error: "Source indexing could not be completed. Please retry.",
      },
    },
    openaiFileId: "file-alpha",
    ...overrides,
  };
}

function sourceRepository(initial: ProviderSourceDocument[] = []) {
  const documents = [...initial];
  const repository: SourceRepository = {
    getWorkspaceUsage: vi.fn().mockResolvedValue({
      fileCount: 0,
      workspaceBytes: 0,
      pageCount: 0,
      extractedTokenCount: 0,
      unknownPageCount: 0,
      unknownExtractedTokenCount: 0,
      contentHashes: [],
    }),
    create: vi.fn(async (source: SourceDocument) => {
      documents.push({ source, openaiFileId: null });
      return source;
    }),
    recordExtractionMetrics: vi.fn(async (projectId, sourceId, metrics) => {
      const document = documents.find(
        (item) => item.source.projectId === projectId && item.source.id === sourceId,
      );
      if (!document) {
        throw new Error("Source not found");
      }
      const processing = {
        ...document.source.processing,
        ...(metrics.pageCount === undefined ? {} : { pageCount: metrics.pageCount }),
        extractedTokenCount: metrics.extractedTokenCount,
        extractionStatus: metrics.finalized ? ("ready" as const) : document.source.processing.extractionStatus,
      };
      delete processing.error;
      document.source = { ...document.source, processing };
      return document.source;
    }),
    findById: vi.fn(async (projectId, sourceId) =>
      documents.find(
        (document) =>
          document.source.projectId === projectId && document.source.id === sourceId,
      ) ?? null,
    ),
    findBySourceId: vi.fn(async (sourceId) =>
      documents.find((document) => document.source.id === sourceId) ?? null,
    ),
    list: vi.fn(async (projectId) =>
      documents
        .filter((document) => document.source.projectId === projectId)
        .map((document) => document.source),
    ),
    updateIngestion: vi.fn(
      async (projectId, sourceId, update: SourceIngestionUpdate) => {
        const document = documents.find(
          (item) => item.source.projectId === projectId && item.source.id === sourceId,
        );
        if (!document) {
          throw new Error("Source not found");
        }
        const processing: SourceDocument["processing"] = {
          ...document.source.processing,
          ...(update.uploadStatus === undefined
            ? {}
            : { uploadStatus: update.uploadStatus }),
          ...(update.extractionStatus === undefined
            ? {}
            : { extractionStatus: update.extractionStatus }),
          ...(update.analysisStatus === undefined
            ? {}
            : { analysisStatus: update.analysisStatus }),
          ...(update.processingError === undefined || update.processingError === null
            ? {}
            : { error: update.processingError }),
          ...(update.requiresExtractionMetrics === undefined
            ? {}
            : { requiresExtractionMetrics: update.requiresExtractionMetrics }),
        };
        if (update.processingError === null) {
          delete processing.error;
        }
        document.source = { ...document.source, processing };
        if (update.openaiFileId !== undefined) {
          document.openaiFileId = update.openaiFileId;
        }
        return document;
      },
    ),
    delete: vi.fn(async (projectId, sourceId) => {
      const index = documents.findIndex(
        (document) =>
          document.source.projectId === projectId && document.source.id === sourceId,
      );
      if (index < 0) {
        throw new Error("Source not found");
      }
      documents.splice(index, 1);
    }),
  };
  return { repository, documents };
}

function projectRepository(vectorStoreId: string | null = null): ProjectRepository {
  let storedVectorStoreId = vectorStoreId;
  let provisioningToken: string | null = null;
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndEditTokenHash: vi.fn(),
    updateTeachingBrief: vi.fn(),
    findVectorStoreId: vi.fn(async () => storedVectorStoreId),
    claimVectorStoreId: vi.fn(async (_projectId, candidateId) => {
      storedVectorStoreId ??= candidateId;
      return storedVectorStoreId as string;
    }),
    acquireVectorStoreProvisioning: vi.fn(async (_projectId, token) => {
      if (storedVectorStoreId) {
        return { vectorStoreId: storedVectorStoreId, acquired: false };
      }
      if (provisioningToken) {
        return { vectorStoreId: null, acquired: false };
      }
      provisioningToken = token;
      return { vectorStoreId: null, acquired: true };
    }),
    completeVectorStoreProvisioning: vi.fn(async (_projectId, token, candidateId) => {
      if (provisioningToken !== token) {
        return storedVectorStoreId;
      }
      provisioningToken = null;
      storedVectorStoreId ??= candidateId;
      return storedVectorStoreId;
    }),
    releaseVectorStoreProvisioning: vi.fn(async (_projectId, token) => {
      if (provisioningToken === token) {
        provisioningToken = null;
      }
    }),
  };
}

function provider(
  statuses: Array<VectorStoreFileProgress | VectorStoreFileProgress["status"]>,
  options?: { extractedText?: string },
) {
  return {
    createVectorStore: vi.fn().mockResolvedValue({ id: "vs-alpha" }),
    deleteVectorStore: vi.fn().mockResolvedValue(undefined),
    uploadFile: vi.fn().mockResolvedValue({ id: "file-alpha" }),
    attachFile: vi.fn().mockResolvedValue(undefined),
    getFileStatus: vi.fn(async () => {
      const next = statuses.shift() ?? "in_progress";
      return typeof next === "string" ? { status: next } : next;
    }),
    getExtractedText: vi.fn().mockResolvedValue(
      options ? options.extractedText : "one two three four\f",
    ),
    detachFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  } satisfies OpenAIFileProvider;
}

function dependencies(
  repository: SourceRepository,
  projects: ProjectRepository,
  openAI: OpenAIFileProvider,
) {
  return {
    sourceRepository: repository,
    projectRepository: projects,
    provider: openAI,
    wait: vi.fn().mockResolvedValue(undefined),
    maxPollAttempts: 2,
    pollDelayMs: 0,
  };
}

describe("OpenAI source ingestion", () => {
  it("uploads, attaches, polls through reading, and returns a safe ready snapshot", async () => {
    const sources = sourceRepository();
    const openAI = provider(["in_progress", "completed"]);
    const result = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("private notes") },
      {
        role: "lecture",
        authority: "course_authoritative",
        permissions,
        containsProtectedSolutions: false,
      },
      dependencies(sources.repository, projectRepository(), openAI),
    );

    expect(result.processing).toMatchObject({
      uploadStatus: "ready",
      extractionStatus: "ready",
    });
    expect(openAI.attachFile).toHaveBeenCalledWith("vs-alpha", "file-alpha");
    expect(openAI.getFileStatus).toHaveBeenCalledTimes(2);
    expect(openAI.getExtractedText).toHaveBeenCalledWith("vs-alpha", "file-alpha");
    expect(sources.repository.recordExtractionMetrics).toHaveBeenCalledWith(
      "project-alpha",
      result.id,
      expect.objectContaining({ pageCount: 1, extractedTokenCount: 4, finalized: true }),
    );
    expect(JSON.stringify(result)).not.toContain("file-alpha");
    expect(JSON.stringify(result)).not.toContain("vs-alpha");
  });

  it("keeps an incomplete provider operation in the reading state", async () => {
    const sources = sourceRepository();
    const openAI = provider(["in_progress"]);
    const result = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      { ...dependencies(sources.repository, projectRepository(), openAI), maxPollAttempts: 1 },
    );

    expect(result.processing.extractionStatus).toBe("in_progress");
  });

  it("keeps completed indexing non-ready until a trustworthy extraction metric is available", async () => {
    const sources = sourceRepository();
    const openAI = provider(["completed"], { extractedText: undefined });
    const result = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );

    expect(result.processing).toMatchObject({
      extractionStatus: "in_progress",
      requiresExtractionMetrics: true,
    });
    expect(sources.repository.recordExtractionMetrics).not.toHaveBeenCalled();
  });

  it("keeps an over-page-budget source non-ready when atomic metric finalization rejects it", async () => {
    const sources = sourceRepository();
    sources.repository.recordExtractionMetrics = vi.fn(async (_projectId, _sourceId, metrics) => {
      if ((metrics.pageCount ?? 0) > 500) {
        throw new Error("The source would exceed the workspace page limit.");
      }
      throw new Error("Unexpected metrics");
    });
    const openAI = provider(["completed"], {
      extractedText: Array.from({ length: 501 }, (_, index) => `page ${index + 1}`).join("\f"),
    });

    const result = await ingestSource(
      "project-alpha",
      { name: "too-many-pages.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("pdf") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );

    expect(sources.repository.recordExtractionMetrics).toHaveBeenCalledWith(
      "project-alpha",
      result.id,
      expect.objectContaining({ pageCount: 501, finalized: true }),
    );
    expect(result.processing.extractionStatus).toBe("failed");
  });

  it("persists a safe failed state without raw provider diagnostics", async () => {
    const sources = sourceRepository();
    const openAI = provider(["failed"]);
    const result = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );

    expect(result.processing).toEqual(
      expect.objectContaining({
        extractionStatus: "failed",
        error: "Source indexing could not be completed. Please retry.",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });

  it("re-attaches a failed indexed file and transitions it to ready on retry", async () => {
    const source = storedSource();
    const sources = sourceRepository([source]);
    const openAI = provider(["completed"]);

    const result = await refreshSourceProcessing(
      "source-alpha",
      dependencies(sources.repository, projectRepository("vs-alpha"), openAI),
    );

    expect(openAI.attachFile).toHaveBeenCalledWith("vs-alpha", "file-alpha");
    expect(openAI.detachFile).toHaveBeenCalledWith("vs-alpha", "file-alpha");
    expect(result.processing.extractionStatus).toBe("ready");
    expect(result.processing).not.toHaveProperty("error");
  });

  it("marks attach failures as retryable indexing failures and tolerates duplicate re-attachment", async () => {
    const sources = sourceRepository();
    const openAI = provider(["completed"]);
    openAI.attachFile.mockRejectedValueOnce(new Error("attachment unavailable"));
    const failed = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );
    openAI.attachFile.mockRejectedValueOnce({ status: 409, code: "already_exists" });

    const retried = await refreshSourceProcessing(
      failed.id,
      dependencies(sources.repository, projectRepository("vs-alpha"), openAI),
    );

    expect(failed.processing).toMatchObject({
      uploadStatus: "ready",
      extractionStatus: "failed",
    });
    expect(retried.processing.extractionStatus).toBe("ready");
    expect(openAI.detachFile).toHaveBeenCalledTimes(2);
  });

  it("detaches and recreates a confirmed terminal-failed association before retrying", async () => {
    const sources = sourceRepository();
    const openAI = provider(["failed", "completed"]);
    const failed = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );

    const retried = await refreshSourceProcessing(
      failed.id,
      dependencies(sources.repository, projectRepository("vs-alpha"), openAI),
    );

    expect(failed.processing.extractionStatus).toBe("failed");
    expect(openAI.detachFile).toHaveBeenCalledWith("vs-alpha", "file-alpha");
    expect(openAI.attachFile).toHaveBeenCalledTimes(2);
    expect(retried.processing.extractionStatus).toBe("ready");
  });

  it("marks upload failures as re-upload-required instead of retrying absent bytes", async () => {
    const sources = sourceRepository();
    const openAI = provider([]);
    openAI.uploadFile.mockRejectedValueOnce(new Error("upload unavailable"));
    const failed = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projectRepository(), openAI),
    );
    const refreshed = await refreshSourceProcessing(
      failed.id,
      dependencies(sources.repository, projectRepository("vs-alpha"), openAI),
    );

    expect(failed.processing).toMatchObject({
      uploadStatus: "failed",
      extractionStatus: "pending",
      error: "Upload did not complete. Upload this source again.",
    });
    expect(refreshed.processing.error).toBe("Upload did not complete. Upload this source again.");
    expect(openAI.uploadFile).toHaveBeenCalledOnce();
  });

  it("cleans up an orphaned vector store when persistent provisioning claim fails", async () => {
    const sources = sourceRepository();
    const projects = projectRepository();
    projects.completeVectorStoreProvisioning = vi.fn().mockResolvedValue(null);
    const openAI = provider([]);

    await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projects, openAI),
    );

    expect(openAI.deleteVectorStore).toHaveBeenCalledWith("vs-alpha");
    expect(projects.releaseVectorStoreProvisioning).toHaveBeenCalled();
  });

  it("keeps a vector store that was persistently committed before completion acknowledgement failed", async () => {
    const sources = sourceRepository();
    const projects = projectRepository();
    projects.completeVectorStoreProvisioning = vi.fn().mockRejectedValue(new Error("timeout"));
    projects.findVectorStoreId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("vs-alpha");
    const openAI = provider(["completed"]);

    const result = await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projects, openAI),
    );

    expect(result.processing.extractionStatus).toBe("ready");
    expect(openAI.deleteVectorStore).not.toHaveBeenCalled();
  });

  it("retains a newly created vector store when completion reconciliation cannot be read", async () => {
    const sources = sourceRepository();
    const projects = projectRepository();
    projects.completeVectorStoreProvisioning = vi.fn().mockRejectedValue(new Error("timeout"));
    projects.findVectorStoreId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("database unavailable"));
    const openAI = provider([]);

    await ingestSource(
      "project-alpha",
      { name: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      dependencies(sources.repository, projects, openAI),
    );

    expect(openAI.deleteVectorStore).not.toHaveBeenCalled();
  });

  it("uses one persistently claimed vector store when concurrent ingests race", async () => {
    const sources = sourceRepository();
    const projects = projectRepository();
    const openAI = provider([
      "completed",
      "completed",
    ]);
    let releaseCreation: (() => void) | undefined;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    openAI.createVectorStore.mockImplementationOnce(async () => {
      await creationGate;
      return { id: "vs-alpha" };
    });
    const concurrentDependencies = {
      ...dependencies(sources.repository, projects, openAI),
      maxPollAttempts: 10,
      wait: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    };

    const first = ingestSource(
      "project-alpha",
      { name: "notes-a.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes-a") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      concurrentDependencies,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = ingestSource(
      "project-alpha",
      { name: "notes-b.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("notes-b") },
      { role: "lecture", authority: "course_authoritative", permissions, containsProtectedSolutions: false },
      concurrentDependencies,
    );
    releaseCreation?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(openAI.createVectorStore).toHaveBeenCalledTimes(1);
  });

  it("removes provider resources best-effort before deleting the local source", async () => {
    const source = storedSource();
    const sources = sourceRepository([source]);
    const openAI = provider([]);
    openAI.detachFile.mockRejectedValueOnce(new Error("provider unavailable"));

    await removeSource(
      "project-alpha",
      "source-alpha",
      dependencies(sources.repository, projectRepository("vs-alpha"), openAI),
    );

    expect(openAI.deleteFile).toHaveBeenCalledWith("file-alpha");
    expect(sources.repository.delete).toHaveBeenCalledWith("project-alpha", "source-alpha");
    expect(sources.documents).toHaveLength(0);
  });
});
