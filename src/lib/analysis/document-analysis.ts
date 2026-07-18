import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getDocumentAnalyst,
  parseAnalyzedDocument,
  type DocumentAnalyst,
} from "@/lib/ai/document-analyst";
import {
  DEFAULT_DOCUMENT_ANALYSIS_PROFILE,
  DOCUMENT_ANALYSIS_SCHEMA_VERSION,
} from "@/lib/ai/prompts/document-analyst";
import { getDb } from "@/lib/db";
import {
  getFixtureDocumentAnalysisRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  getPipelineJobRepository,
  type PipelineJobRepository,
} from "@/lib/jobs/repository";
import {
  getProjectRepository,
  type ProjectRepository,
} from "@/lib/projects/repository";
import {
  getSourceRepository,
  type ProviderSourceDocument,
  type SourceRepository,
} from "@/lib/sources/repository";
import {
  DocumentAnalysisSchema,
  type DocumentAnalysis,
  type PipelineJob,
} from "@/lib/schemas";

export type AnalyzeOptions = {
  analysisProfile?: string;
  force?: boolean;
};

type PersistedAnalysis = {
  id: string;
  projectId: string;
  documentId: string;
  documentHash: string;
  schemaVersion: string;
  analysisProfile: string;
  artifact: Prisma.JsonValue;
};

export interface DocumentAnalysisRepository {
  findCached(input: {
    projectId: string;
    documentHash: string;
    schemaVersion: string;
    analysisProfile: string;
  }): Promise<DocumentAnalysis | null>;
  save(
    input: DocumentAnalysis & { analysisProfile: string },
  ): Promise<DocumentAnalysis>;
}

function toAnalysis(record: PersistedAnalysis): DocumentAnalysis {
  return DocumentAnalysisSchema.parse(record.artifact);
}

export function getDocumentAnalysisRepository(): DocumentAnalysisRepository {
  if (isFixtureRuntime()) return getFixtureDocumentAnalysisRepository();
  const db = getDb();
  return {
    async findCached(input) {
      const result = await db.documentAnalysis.findUnique({
        where: {
          projectId_documentHash_schemaVersion_analysisProfile: input,
        },
      });
      return result ? toAnalysis(result) : null;
    },
    async save(input) {
      const { analysisProfile, ...artifact } = input;
      const parsed = DocumentAnalysisSchema.parse(artifact);
      const record = await db.documentAnalysis.upsert({
        where: {
          projectId_documentHash_schemaVersion_analysisProfile: {
            projectId: parsed.projectId,
            documentHash: parsed.documentHash,
            schemaVersion: parsed.schemaVersion,
            analysisProfile,
          },
        },
        create: {
          id: parsed.id,
          projectId: parsed.projectId,
          documentId: parsed.documentId,
          documentHash: parsed.documentHash,
          schemaVersion: parsed.schemaVersion,
          analysisProfile,
          artifact: parsed as Prisma.InputJsonValue,
        },
        update: {
          documentId: parsed.documentId,
          artifact: parsed as Prisma.InputJsonValue,
        },
      });
      return toAnalysis(record);
    },
  };
}

export class DocumentAnalysisError extends Error {
  constructor(
    readonly code: "SOURCE_NOT_READY" | "ANALYSIS_FAILED",
  ) {
    super(
      code === "SOURCE_NOT_READY"
        ? "This source is not ready for analysis."
        : "Document analysis could not be completed. Please retry.",
    );
  }
}

type Dependencies = {
  sourceRepository: SourceRepository;
  analysisRepository: DocumentAnalysisRepository;
  projectRepository: ProjectRepository;
  analyst: DocumentAnalyst;
  jobRepository: PipelineJobRepository;
  now: () => Date;
};

function dependencies(overrides?: Partial<Dependencies>): Dependencies {
  return {
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    analysisRepository:
      overrides?.analysisRepository ?? getDocumentAnalysisRepository(),
    projectRepository: overrides?.projectRepository ?? getProjectRepository(),
    analyst: overrides?.analyst ?? getDocumentAnalyst(),
    jobRepository: overrides?.jobRepository ?? getPipelineJobRepository(),
    now: overrides?.now ?? (() => new Date()),
  };
}

function safeFailure() {
  return "Document analysis could not be completed. Please retry.";
}

function assertReadyForAnalysis(record: ProviderSourceDocument) {
  if (
    record.source.processing.extractionStatus !== "ready" ||
    !record.openaiFileId
  ) {
    throw new DocumentAnalysisError("SOURCE_NOT_READY");
  }
}

function cacheKey(sources: ProviderSourceDocument[], profile: string) {
  const hash = createHash("sha256");
  hash.update(profile);
  for (const source of sources.sort((left, right) =>
    left.source.id.localeCompare(right.source.id),
  )) {
    hash.update(source.source.id);
    hash.update(source.source.contentHash);
  }
  return `analysis-${hash.digest("hex")}`;
}

async function runStructuredAnalysis(
  record: ProviderSourceDocument,
  profile: string,
  deps: Dependencies,
): Promise<DocumentAnalysis> {
  assertReadyForAnalysis(record);
  const cached = await deps.analysisRepository.findCached({
    projectId: record.source.projectId,
    documentHash: record.source.contentHash,
    schemaVersion: DOCUMENT_ANALYSIS_SCHEMA_VERSION,
    analysisProfile: profile,
  });
  if (cached) {
    await deps.sourceRepository.updateIngestion(
      record.source.projectId,
      record.source.id,
      {
        analysisStatus: "ready",
        processingError: null,
      },
    );
    return cached;
  }
  await deps.sourceRepository.updateIngestion(
    record.source.projectId,
    record.source.id,
    {
      analysisStatus: "in_progress",
      processingError: null,
    },
  );
  try {
    const project = await deps.projectRepository.findById(
      record.source.projectId,
    );
    if (!project) {
      throw new DocumentAnalysisError("SOURCE_NOT_READY");
    }
    const input = {
      source: record.source,
      teachingBrief: project.teachingBrief,
      openaiFileId: record.openaiFileId!,
      analysisId: randomUUID(),
      analyzedAt: deps.now().toISOString(),
    };
    const initialOutput = await deps.analyst.analyze(input);
    let analysis: DocumentAnalysis;
    try {
      analysis = parseAnalyzedDocument(initialOutput);
    } catch {
      analysis = parseAnalyzedDocument(
        await deps.analyst.repair(input, initialOutput),
      );
    }
    if (
      analysis.projectId !== record.source.projectId ||
      analysis.documentId !== record.source.id ||
      analysis.documentHash !== record.source.contentHash
    ) {
      throw new DocumentAnalysisError("ANALYSIS_FAILED");
    }
    const saved = await deps.analysisRepository.save({
      ...analysis,
      analysisProfile: profile,
    });
    await deps.sourceRepository.updateIngestion(
      record.source.projectId,
      record.source.id,
      {
        analysisStatus: "ready",
        processingError: null,
      },
    );
    return saved;
  } catch (error) {
    console.error("Document analysis failed", {
      sourceId: record.source.id,
      sourceName: record.source.name,
      error,
    });
    await deps.sourceRepository.updateIngestion(
      record.source.projectId,
      record.source.id,
      {
        analysisStatus: "failed",
        processingError: safeFailure(),
      },
    );
    if (error instanceof DocumentAnalysisError) {
      throw error;
    }
    throw new DocumentAnalysisError("ANALYSIS_FAILED");
  }
}

export async function analyzeDocument(
  sourceId: string,
  options?: AnalyzeOptions,
  overrides?: Partial<Dependencies>,
): Promise<DocumentAnalysis> {
  const deps = dependencies(overrides);
  const source = await deps.sourceRepository.findBySourceId(sourceId);
  if (!source) {
    throw new DocumentAnalysisError("SOURCE_NOT_READY");
  }
  return runStructuredAnalysis(
    source,
    options?.analysisProfile ?? DEFAULT_DOCUMENT_ANALYSIS_PROFILE,
    deps,
  );
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<void>,
) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = items[index++];
        if (current !== undefined) await operation(current);
      }
    }),
  );
}

export async function analyzePendingDocuments(
  projectId: string,
  options?: AnalyzeOptions,
  overrides?: Partial<Dependencies>,
): Promise<PipelineJob> {
  const deps = dependencies(overrides);
  const profile = options?.analysisProfile ?? DEFAULT_DOCUMENT_ANALYSIS_PROFILE;
  const eligible = (await deps.sourceRepository.list(projectId)).filter(
    (source) => source.processing.extractionStatus === "ready",
  );
  const records = (
    await Promise.all(
      eligible.map((source) =>
        deps.sourceRepository.findById(projectId, source.id),
      ),
    )
  ).filter((source): source is ProviderSourceDocument => source !== null);
  const pending: ProviderSourceDocument[] = [];
  for (const record of records) {
    const cached =
      !options?.force &&
      (await deps.analysisRepository.findCached({
        projectId,
        documentHash: record.source.contentHash,
        schemaVersion: DOCUMENT_ANALYSIS_SCHEMA_VERSION,
        analysisProfile: profile,
      }));
    if (cached) {
      if (record.source.processing.analysisStatus !== "ready") {
        await deps.sourceRepository.updateIngestion(
          projectId,
          record.source.id,
          { analysisStatus: "ready", processingError: null },
        );
      }
    } else {
      pending.push(record);
    }
  }
  const started = await deps.jobRepository.start({
    id: randomUUID(),
    projectId,
    stage: "analysis",
    idempotencyKey: cacheKey(pending, profile),
  });
  const { job } = started;
  if (!started.shouldRun) return job;
  try {
    let completed = 0;
    let failures = 0;
    await runWithConcurrency(pending, 3, async (record) => {
      try {
        await runStructuredAnalysis(record, profile, deps);
      } catch {
        failures += 1;
      } finally {
        completed += 1;
        await deps.jobRepository.updateProgress(
          job.id,
          pending.length === 0 ? 1 : completed / pending.length,
        );
      }
    });
    if (failures > 0) {
      return deps.jobRepository.fail(job.id, {
        code: "analysis_failed",
        message:
          "One or more documents could not be analyzed. Retry those documents individually.",
        retryable: true,
      });
    }
    return deps.jobRepository.complete(job.id);
  } catch {
    return deps.jobRepository.fail(job.id, {
      code: "analysis_failed",
      message: "Document analysis could not be completed. Please retry.",
      retryable: true,
    });
  }
}

export async function retryDocumentAnalysis(
  projectId: string,
  sourceId: string,
  overrides?: Partial<Dependencies>,
): Promise<PipelineJob> {
  const deps = dependencies(overrides);
  const source = await deps.sourceRepository.findById(projectId, sourceId);
  if (!source) throw new DocumentAnalysisError("SOURCE_NOT_READY");
  const started = await deps.jobRepository.start({
    id: randomUUID(),
    projectId,
    sourceDocumentId: sourceId,
    stage: "analysis",
    idempotencyKey: `analysis-${sourceId}-${source.source.contentHash}`,
  });
  const { job } = started;
  if (!started.shouldRun) return job;
  try {
    const analysis = await runStructuredAnalysis(
      source,
      DEFAULT_DOCUMENT_ANALYSIS_PROFILE,
      deps,
    );
    return deps.jobRepository.complete(job.id, analysis.id);
  } catch {
    return deps.jobRepository.fail(job.id, {
      code: "analysis_failed",
      message: safeFailure(),
      retryable: true,
    });
  }
}
