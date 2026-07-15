import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => ({
  sourceDocument: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: () => database }));

import { DEFAULT_WORKSPACE_BUDGET, parseSourceDocument } from "@/lib/schemas";
import { getSourceRepository, SourceValidationError } from "@/lib/sources";

function storedSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-alpha",
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
    sizeBytes: 100,
    uploadStatus: "pending",
    extractionStatus: "pending",
    analysisStatus: "pending",
    pageCount: null,
    extractedTokenCount: null,
    processingError: null,
    ...overrides,
  };
}

function sourceDocument(overrides: Record<string, unknown> = {}) {
  const source = storedSource(overrides);
  return parseSourceDocument({
    id: source.id,
    projectId: source.projectId,
    name: source.name,
    role: source.role,
    authority: source.authority,
    permissions: source.permissions,
    containsProtectedSolutions: source.containsProtectedSolutions,
    contentHash: source.contentHash,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    processing: {
      uploadStatus: source.uploadStatus,
      extractionStatus: source.extractionStatus,
      analysisStatus: source.analysisStatus,
      ...(source.pageCount === null ? {} : { pageCount: source.pageCount }),
      ...(source.extractedTokenCount === null
        ? {}
        : { extractedTokenCount: source.extractedTokenCount }),
    },
  });
}

function transactionFor(sources: ReturnType<typeof storedSource>[]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "project-alpha" }]),
    sourceDocument: {
      findMany: vi.fn().mockImplementation(async () => sources),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const created = storedSource({
          ...data,
          pageCount: data.pageCount ?? null,
          extractedTokenCount: data.extractedTokenCount ?? null,
          processingError: data.processingError ?? null,
        });
        sources.push(created);
        return created;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const source = sources.find((item) => item.id === where.id);
        if (!source) {
          throw new Error("Source not found");
        }
        if (data.pageCount !== undefined) {
          source.pageCount = data.pageCount;
        }
        if (data.extractedTokenCount !== undefined) {
          source.extractedTokenCount = data.extractedTokenCount;
        }
        if (data.extractionStatus !== undefined) {
          source.extractionStatus = data.extractionStatus;
        }
        return source;
      }),
    },
  };
}

describe("source repository policy boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates persisted source usage including unknown extraction metrics", async () => {
    database.sourceDocument.findMany.mockResolvedValueOnce([
      storedSource({ pageCount: 3, extractedTokenCount: 20 }),
      storedSource({
        id: "document-beta",
        contentHash: "b".repeat(64),
        sizeBytes: 50,
      }),
    ]);

    await expect(getSourceRepository().getWorkspaceUsage("project-alpha")).resolves.toEqual({
      fileCount: 2,
      workspaceBytes: 150,
      pageCount: 3,
      extractedTokenCount: 20,
      unknownPageCount: 1,
      unknownExtractedTokenCount: 1,
      contentHashes: ["a".repeat(64), "b".repeat(64)],
    });
  });

  it("rejects extraction metrics that would exceed a deferred hard limit before persisting", async () => {
    const source = storedSource();
    const transaction = transactionFor([source]);
    database.$transaction.mockImplementationOnce((callback) => callback(transaction));

    await expect(
      getSourceRepository().recordExtractionMetrics("project-alpha", "document-alpha", {
        pageCount: DEFAULT_WORKSPACE_BUDGET.maxPages + 1,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: "PAGE_LIMIT_EXCEEDED" } satisfies Partial<SourceValidationError>),
    );
    expect(transaction.sourceDocument.update).not.toHaveBeenCalled();
  });

  it("rejects aggregate budgets and protected retrieval permissions inside creation", async () => {
    const cappedTransaction = transactionFor(
      Array.from({ length: DEFAULT_WORKSPACE_BUDGET.maxFiles }, (_, index) =>
        storedSource({
          id: `document-${index}`,
          contentHash: "a".repeat(63) + (index % 10),
        }),
      ),
    );
    database.$transaction.mockImplementationOnce((callback) => callback(cappedTransaction));

    await expect(getSourceRepository().create(sourceDocument())).rejects.toEqual(
      expect.objectContaining({ code: "FILE_COUNT_LIMIT_EXCEEDED" } satisfies Partial<SourceValidationError>),
    );
    expect(cappedTransaction.sourceDocument.create).not.toHaveBeenCalled();

    const protectedTransaction = transactionFor([]);
    database.$transaction.mockImplementationOnce((callback) => callback(protectedTransaction));
    await expect(
      getSourceRepository().create(
        sourceDocument({
          containsProtectedSolutions: true,
          permissions: {
            ...storedSource().permissions,
            useForRuntimeRetrieval: true,
          },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PROTECTED_SOURCE_PERMISSION_DENIED",
      } satisfies Partial<SourceValidationError>),
    );
    expect(protectedTransaction.sourceDocument.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent creates so the later source observes the committed cap", async () => {
    const sources = Array.from(
      { length: DEFAULT_WORKSPACE_BUDGET.maxFiles - 1 },
      (_, index) =>
        storedSource({
          id: `document-${index}`,
          contentHash: "a".repeat(63) + (index % 10),
        }),
    );
    const transaction = transactionFor(sources);
    let queue = Promise.resolve();
    database.$transaction.mockImplementation((callback) => {
      const operation = queue.then(() => callback(transaction));
      queue = operation.catch(() => undefined);
      return operation;
    });
    const repository = getSourceRepository();

    const results = await Promise.allSettled([
      repository.create(sourceDocument({ id: "document-first", contentHash: "b".repeat(64) })),
      repository.create(sourceDocument({ id: "document-second", contentHash: "c".repeat(64) })),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.sourceDocument.create).toHaveBeenCalledTimes(1);
  });

  it("preserves omitted metrics and requires a token count when finalizing extraction", async () => {
    const source = storedSource({ pageCount: 5, extractedTokenCount: 10 });
    const transaction = transactionFor([source]);
    database.$transaction.mockImplementationOnce((callback) => callback(transaction));

    const updated = await getSourceRepository().recordExtractionMetrics(
      "project-alpha",
      "document-alpha",
      { pageCount: 6 },
    );
    expect(updated.processing).toMatchObject({
      pageCount: 6,
      extractedTokenCount: 10,
    });
    expect(transaction.sourceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pageCount: 6 } }),
    );

    const incompleteTransaction = transactionFor([storedSource()]);
    database.$transaction.mockImplementationOnce((callback) =>
      callback(incompleteTransaction),
    );
    await expect(
      getSourceRepository().recordExtractionMetrics(
        "project-alpha",
        "document-alpha",
        { finalized: true },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "EXTRACTED_TOKEN_COUNT_REQUIRED",
      } satisfies Partial<SourceValidationError>),
    );
    expect(incompleteTransaction.sourceDocument.update).not.toHaveBeenCalled();
  });

  it("persists a token count before marking extraction ready", async () => {
    const transaction = transactionFor([storedSource()]);
    database.$transaction.mockImplementationOnce((callback) => callback(transaction));

    const source = await getSourceRepository().recordExtractionMetrics(
      "project-alpha",
      "document-alpha",
      { extractedTokenCount: 42, finalized: true },
    );

    expect(source.processing).toMatchObject({
      extractedTokenCount: 42,
      extractionStatus: "ready",
    });
    expect(transaction.sourceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { extractedTokenCount: 42, extractionStatus: "ready" },
      }),
    );
  });
});
