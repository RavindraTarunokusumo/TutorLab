import { describe, expect, it, vi } from "vitest";
import type { DocumentAnalyst } from "@/lib/ai/document-analyst";
import {
  analyzeDocument,
  analyzePendingDocuments,
  type DocumentAnalysisRepository,
} from "@/lib/analysis/document-analysis";
import type { PipelineJobRepository } from "@/lib/jobs/repository";
import type { ProjectRepository } from "@/lib/projects/repository";
import type { ProviderSourceDocument, SourceRepository } from "@/lib/sources/repository";
import type { DocumentAnalysis, PipelineJob, SourceDocument } from "@/lib/schemas";

vi.mock("server-only", () => ({}));

const permissions = {
  useForCourseModel: true,
  useForPedagogyDrafting: true,
  useForRuntimeRetrieval: false,
  useForEvaluation: true,
  revealExcerptsToStudents: false,
};

function source(id: string, hash?: string): ProviderSourceDocument {
  const contentHash = hash ?? id
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0)
    .toString(16)
    .padStart(64, "a");
  return {
    source: {
      id,
      projectId: "project-alpha",
      name: `${id}.md`,
      role: "lecture",
      authority: "course_authoritative",
      permissions,
      containsProtectedSolutions: false,
      contentHash,
      mimeType: "text/markdown",
      sizeBytes: 5,
      processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus: "pending" },
    },
    openaiFileId: `file-${id}`,
  };
}

function analysisFor(input: Parameters<DocumentAnalyst["analyze"]>[0]): DocumentAnalysis {
  return {
    schemaVersion: "0.1",
    id: input.analysisId,
    projectId: input.source.projectId,
    documentId: input.source.id,
    documentHash: input.source.contentHash,
    classification: { role: input.source.role, confidence: 0.9 },
    coverage: { extractionWarnings: [] },
    findings: {
      topics: [{ id: `topic-${input.source.id}`, label: "Probability", description: "Probability topic", provenance: "source_grounded", evidence: [{ documentId: input.source.id, documentAnalysisId: input.analysisId, excerptId: "excerpt-1", locatorLabel: "Section 1" }], confidence: 0.9 }],
      objectives: [], terminology: [], acceptedMethods: [], exercises: [], assessmentCriteria: [], protectedSolutions: [], misconceptions: [], pedagogicalPatterns: [],
    },
    summary: "A concise source-grounded summary.",
    analyzedAt: input.analyzedAt,
  };
}

function setup(records: ProviderSourceDocument[]) {
  const cached = new Map<string, DocumentAnalysis>();
  const updates: Array<{ sourceId: string; update: object }> = [];
  const sourceRepository = {
    getWorkspaceUsage: vi.fn(), create: vi.fn(), recordExtractionMetrics: vi.fn(), delete: vi.fn(),
    list: vi.fn(async () => records.map((record) => record.source)),
    findById: vi.fn(async (_projectId, sourceId) => records.find((record) => record.source.id === sourceId) ?? null),
    findBySourceId: vi.fn(async (sourceId) => records.find((record) => record.source.id === sourceId) ?? null),
    updateIngestion: vi.fn(async (_projectId, sourceId, update) => {
      const record = records.find((item) => item.source.id === sourceId)!;
      record.source = { ...record.source, processing: { ...record.source.processing, ...update } } as SourceDocument;
      updates.push({ sourceId, update });
      return record;
    }),
  } as unknown as SourceRepository;
  const analysisRepository: DocumentAnalysisRepository = {
    findCached: vi.fn(async (input) => cached.get(`${input.documentHash}:${input.analysisProfile}`) ?? null),
    save: vi.fn(async (input) => {
      cached.set(`${input.documentHash}:${input.analysisProfile}`, input);
      return input;
    }),
  };
  let job: PipelineJob | undefined;
  const jobRepository: PipelineJobRepository = {
    start: vi.fn(async (input) => {
      if (job?.status === "completed") return { job, shouldRun: false };
      job = { schemaVersion: "0.1", id: input.id, projectId: input.projectId, ...(input.sourceDocumentId ? { sourceDocumentId: input.sourceDocumentId } : {}), stage: "analysis", idempotencyKey: input.idempotencyKey, status: "running", attemptCount: 1, progress: 0, startedAt: "2026-07-15T12:00:00.000Z" };
      return { job, shouldRun: true };
    }),
    updateProgress: vi.fn(async (_id, progress) => ({ ...job!, progress })),
    complete: vi.fn(async (_id, resultId) => ({ ...job!, status: "completed" as const, progress: 1, ...(resultId ? { resultId } : {}), completedAt: "2026-07-15T12:01:00.000Z" })),
    fail: vi.fn(async (_id, diagnostic) => ({ ...job!, status: "failed" as const, diagnostic, completedAt: "2026-07-15T12:01:00.000Z" })),
    findById: vi.fn(),
  };
  const projectRepository = { findVectorStoreId: vi.fn().mockResolvedValue("vs-alpha"), findById: vi.fn().mockResolvedValue({ id: "project-alpha", teachingBrief: {} }) } as unknown as ProjectRepository;
  const provider = { getExtractedText: vi.fn().mockResolvedValue("private extracted text"), createVectorStore: vi.fn(), deleteVectorStore: vi.fn(), uploadFile: vi.fn(), attachFile: vi.fn(), getFileStatus: vi.fn(), detachFile: vi.fn(), deleteFile: vi.fn() };
  const analyst: DocumentAnalyst = { analyze: vi.fn(async (input) => analysisFor(input)), repair: vi.fn(async (input) => analysisFor(input)) };
  return { sourceRepository, analysisRepository, projectRepository, provider, analyst, jobRepository, updates, cached };
}

describe("per-document material analysis", () => {
  it("limits batch work to three concurrent documents and records partial failure without losing successful analyses", async () => {
    const records = ["source-a", "source-b", "source-c", "source-d"].map((id) => source(id));
    const deps = setup(records);
    let active = 0;
    let maxActive = 0;
    deps.analyst.analyze = vi.fn(async (input) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (input.source.id === "source-d") throw new Error("provider diagnostic must stay private");
      return analysisFor(input);
    });
    deps.analyst.repair = vi.fn(async (input) => {
      if (input.source.id === "source-d") throw new Error("provider diagnostic must stay private");
      return analysisFor(input);
    });

    const job = await analyzePendingDocuments("project-alpha", undefined, deps);

    expect(maxActive).toBe(3);
    expect(job.status).toBe("failed");
    expect(deps.analysisRepository.save).toHaveBeenCalledTimes(3);
    expect(records.find((record) => record.source.id === "source-d")?.source.processing).toMatchObject({ analysisStatus: "failed" });
    expect(deps.updates).toContainEqual({
      sourceId: "source-d",
      update: { analysisStatus: "failed", processingError: "Document analysis could not be completed. Please retry." },
    });
  });

  it("reuses a content-hash and profile cache without sending source text to the model", async () => {
    const record = source("source-cache");
    const deps = setup([record]);
    const cached = analysisFor({ source: record.source, teachingBrief: {}, documentText: "", analysisId: "analysis-cache", analyzedAt: "2026-07-15T12:00:00.000Z" });
    deps.cached.set(`${record.source.contentHash}:course-model-v1`, cached);

    const result = await analyzeDocument("source-cache", undefined, deps);

    expect(result).toEqual(cached);
    expect(deps.provider.getExtractedText).not.toHaveBeenCalled();
    expect(deps.analyst.analyze).not.toHaveBeenCalled();
    expect(record.source.processing.analysisStatus).toBe("ready");
  });

  it("repairs one invalid structured response and never persists raw source text", async () => {
    const record = source("source-repair");
    const deps = setup([record]);
    const invalidOutput = { invalid: "private extracted text" };
    deps.analyst.analyze = vi.fn().mockResolvedValue(invalidOutput);

    await analyzeDocument("source-repair", undefined, deps);

    expect(deps.analyst.repair).toHaveBeenCalledOnce();
    expect(deps.analyst.repair).toHaveBeenCalledWith(expect.any(Object), invalidOutput);
    expect(JSON.stringify((deps.analysisRepository.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).not.toContain("private extracted text");
  });
});
