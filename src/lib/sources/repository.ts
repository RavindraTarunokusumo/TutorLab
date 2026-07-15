import "server-only";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureSourceRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  SourceDocumentSchema,
  type SourceDocument,
  type SourcePermissions,
} from "@/lib/schemas";
import {
  EMPTY_WORKSPACE_USAGE,
  evaluateWorkspaceBudget,
  type WorkspaceBudgetUsage,
} from "./budgets";
import { SourceValidationError, validateSourceCandidate } from "./validation";

type PersistedSource = {
  id: string;
  projectId: string;
  name: string;
  role: SourceDocument["role"];
  authority: SourceDocument["authority"];
  permissions: Prisma.JsonValue;
  containsProtectedSolutions: boolean;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: SourceDocument["processing"]["uploadStatus"];
  extractionStatus: SourceDocument["processing"]["extractionStatus"];
  analysisStatus: SourceDocument["processing"]["analysisStatus"];
  pageCount: number | null;
  extractedTokenCount: number | null;
  processingError: string | null;
  openaiFileId: string | null;
  requiresExtractionMetrics: boolean;
};

export type SourceExtractionMetrics = {
  pageCount?: number;
  extractedTokenCount?: number;
  finalized?: boolean;
  requiresExtractionMetrics?: boolean;
};

export type SourceIngestionUpdate = {
  openaiFileId?: string;
  uploadStatus?: SourceDocument["processing"]["uploadStatus"];
  extractionStatus?: SourceDocument["processing"]["extractionStatus"];
  analysisStatus?: SourceDocument["processing"]["analysisStatus"];
  processingError?: string | null;
  requiresExtractionMetrics?: boolean;
};

export type ProviderSourceDocument = {
  source: SourceDocument;
  openaiFileId: string | null;
};

export interface SourceRepository {
  getWorkspaceUsage(projectId: string): Promise<WorkspaceBudgetUsage>;
  create(source: SourceDocument): Promise<SourceDocument>;
  recordExtractionMetrics(
    projectId: string,
    sourceId: string,
    metrics: SourceExtractionMetrics,
  ): Promise<SourceDocument>;
  findById(
    projectId: string,
    sourceId: string,
  ): Promise<ProviderSourceDocument | null>;
  findBySourceId(sourceId: string): Promise<ProviderSourceDocument | null>;
  list(projectId: string): Promise<SourceDocument[]>;
  updateIngestion(
    projectId: string,
    sourceId: string,
    update: SourceIngestionUpdate,
  ): Promise<ProviderSourceDocument>;
  delete(projectId: string, sourceId: string): Promise<void>;
}

function usageFromSources(sources: PersistedSource[]): WorkspaceBudgetUsage {
  return sources.reduce<WorkspaceBudgetUsage>(
    (usage, source) => {
      usage.fileCount += 1;
      usage.workspaceBytes += source.sizeBytes;
      usage.contentHashes = [...usage.contentHashes, source.contentHash];
      if (source.pageCount === null) {
        usage.unknownPageCount += 1;
      } else {
        usage.pageCount += source.pageCount;
      }
      if (source.extractedTokenCount === null) {
        usage.unknownExtractedTokenCount += 1;
      } else {
        usage.extractedTokenCount += source.extractedTokenCount;
      }
      return usage;
    },
    { ...EMPTY_WORKSPACE_USAGE, contentHashes: [] },
  );
}

function toSourceDocument(source: PersistedSource): SourceDocument {
  return SourceDocumentSchema.parse({
    id: source.id,
    projectId: source.projectId,
    name: source.name,
    role: source.role,
    authority: source.authority,
    permissions: source.permissions as SourcePermissions,
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
      ...(source.requiresExtractionMetrics
        ? { requiresExtractionMetrics: true }
        : {}),
      ...(source.processingError === null
        ? {}
        : { error: source.processingError }),
    },
  });
}

const sourceSelection = {
  id: true,
  projectId: true,
  name: true,
  role: true,
  authority: true,
  permissions: true,
  containsProtectedSolutions: true,
  contentHash: true,
  mimeType: true,
  sizeBytes: true,
  uploadStatus: true,
  extractionStatus: true,
  analysisStatus: true,
  pageCount: true,
  extractedTokenCount: true,
  processingError: true,
  openaiFileId: true,
  requiresExtractionMetrics: true,
} as const;

function toProviderSourceDocument(
  source: PersistedSource,
): ProviderSourceDocument {
  return {
    source: toSourceDocument(source),
    openaiFileId: source.openaiFileId,
  };
}

function invalidSourceMetadata(): SourceValidationError {
  return new SourceValidationError(
    "INVALID_SOURCE_METADATA",
    "This source metadata is invalid.",
  );
}

function requireExtractedTokenCount(): SourceValidationError {
  return new SourceValidationError(
    "EXTRACTED_TOKEN_COUNT_REQUIRED",
    "An extracted token count is required before extraction can be finalized.",
  );
}

export function getSourceRepository(): SourceRepository {
  if (isFixtureRuntime()) return getFixtureSourceRepository();
  const db = getDb();

  async function inLockedProjectTransaction<T>(
    projectId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return db.$transaction(
      async (transaction) => {
        const projects = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE
        `;
        if (projects.length === 0) {
          throw new Error("Project not found");
        }
        return operation(transaction);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  return {
    async getWorkspaceUsage(projectId) {
      const sources = await db.sourceDocument.findMany({
        where: { projectId },
        select: sourceSelection,
      });
      return usageFromSources(sources);
    },
    async create(source) {
      const parsed = SourceDocumentSchema.safeParse(source);
      if (!parsed.success) {
        throw invalidSourceMetadata();
      }
      if (
        parsed.data.processing.extractionStatus === "ready" &&
        parsed.data.processing.extractedTokenCount === undefined
      ) {
        throw requireExtractedTokenCount();
      }

      try {
        return await inLockedProjectTransaction(
          parsed.data.projectId,
          async (transaction) => {
            const existingSources = await transaction.sourceDocument.findMany({
              where: { projectId: parsed.data.projectId },
              select: sourceSelection,
            });
            const validation = validateSourceCandidate(
              {
                name: parsed.data.name,
                mimeType: parsed.data.mimeType,
                sizeBytes: parsed.data.sizeBytes,
                pageCount: parsed.data.processing.pageCount,
                extractedTokenCount: parsed.data.processing.extractedTokenCount,
                role: parsed.data.role,
                authority: parsed.data.authority,
                permissions: parsed.data.permissions,
                containsProtectedSolutions:
                  parsed.data.containsProtectedSolutions,
                contentHash: parsed.data.contentHash,
              },
              usageFromSources(existingSources),
            );
            if (!validation.valid) {
              throw new SourceValidationError(
                validation.code,
                validation.message,
              );
            }

            const created = await transaction.sourceDocument.create({
              data: {
                id: parsed.data.id,
                projectId: parsed.data.projectId,
                name: parsed.data.name,
                role: parsed.data.role,
                authority: parsed.data.authority,
                permissions: parsed.data.permissions as Prisma.InputJsonValue,
                containsProtectedSolutions:
                  parsed.data.containsProtectedSolutions,
                contentHash: parsed.data.contentHash,
                mimeType: parsed.data.mimeType,
                sizeBytes: parsed.data.sizeBytes,
                uploadStatus: parsed.data.processing.uploadStatus,
                extractionStatus: parsed.data.processing.extractionStatus,
                analysisStatus: parsed.data.processing.analysisStatus,
                pageCount: parsed.data.processing.pageCount,
                extractedTokenCount: parsed.data.processing.extractedTokenCount,
                processingError: parsed.data.processing.error,
                requiresExtractionMetrics:
                  parsed.data.processing.requiresExtractionMetrics ?? false,
              },
              select: sourceSelection,
            });
            return toSourceDocument(created);
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new SourceValidationError(
            "DUPLICATE_SOURCE_CONTENT",
            "This file has already been added to this workspace.",
          );
        }
        throw error;
      }
    },
    async recordExtractionMetrics(projectId, sourceId, metrics) {
      if (
        (metrics.pageCount !== undefined &&
          (!Number.isSafeInteger(metrics.pageCount) ||
            metrics.pageCount <= 0)) ||
        (metrics.extractedTokenCount !== undefined &&
          (!Number.isSafeInteger(metrics.extractedTokenCount) ||
            metrics.extractedTokenCount < 0))
      ) {
        throw invalidSourceMetadata();
      }

      return inLockedProjectTransaction(projectId, async (transaction) => {
        const sources = await transaction.sourceDocument.findMany({
          where: { projectId },
          select: sourceSelection,
        });
        const source = sources.find((item) => item.id === sourceId);
        if (!source) {
          throw new Error("Source not found");
        }
        const otherUsage = usageFromSources(
          sources.filter((item) => item.id !== sourceId),
        );
        const pageCount = metrics.pageCount ?? source.pageCount ?? undefined;
        const extractedTokenCount =
          metrics.extractedTokenCount ??
          source.extractedTokenCount ??
          undefined;
        if (
          (metrics.finalized || source.extractionStatus === "ready") &&
          extractedTokenCount === undefined
        ) {
          throw requireExtractedTokenCount();
        }
        const budget = evaluateWorkspaceBudget(otherUsage, {
          fileCount: 1,
          workspaceBytes: source.sizeBytes,
          pageCount,
          extractedTokenCount,
          unknownPageCount: pageCount === undefined ? 1 : 0,
          unknownExtractedTokenCount: extractedTokenCount === undefined ? 1 : 0,
        });
        if (!budget.allowed) {
          throw new SourceValidationError(budget.code, budget.message);
        }

        const updated = await transaction.sourceDocument.update({
          where: { id: sourceId },
          data: {
            ...(metrics.pageCount === undefined
              ? {}
              : { pageCount: metrics.pageCount }),
            ...(metrics.extractedTokenCount === undefined
              ? {}
              : { extractedTokenCount: metrics.extractedTokenCount }),
            ...(metrics.finalized ? { extractionStatus: "ready" } : {}),
            ...(metrics.requiresExtractionMetrics === undefined
              ? {}
              : {
                  requiresExtractionMetrics: metrics.requiresExtractionMetrics,
                }),
          },
          select: sourceSelection,
        });
        return toSourceDocument(updated);
      });
    },
    async findById(projectId, sourceId) {
      const source = await db.sourceDocument.findFirst({
        where: { id: sourceId, projectId },
        select: sourceSelection,
      });
      return source ? toProviderSourceDocument(source) : null;
    },
    async findBySourceId(sourceId) {
      const source = await db.sourceDocument.findUnique({
        where: { id: sourceId },
        select: sourceSelection,
      });
      return source ? toProviderSourceDocument(source) : null;
    },
    async list(projectId) {
      const sources = await db.sourceDocument.findMany({
        where: { projectId },
        select: sourceSelection,
        orderBy: { createdAt: "asc" },
      });
      return sources.map(toSourceDocument);
    },
    async updateIngestion(projectId, sourceId, update) {
      return inLockedProjectTransaction(projectId, async (transaction) => {
        const sources = await transaction.sourceDocument.findMany({
          where: { projectId },
          select: sourceSelection,
        });
        const source = sources.find((item) => item.id === sourceId);
        if (!source) {
          throw new Error("Source not found");
        }
        const updated = await transaction.sourceDocument.update({
          where: { id: sourceId },
          data: {
            ...(update.openaiFileId === undefined
              ? {}
              : { openaiFileId: update.openaiFileId }),
            ...(update.uploadStatus === undefined
              ? {}
              : { uploadStatus: update.uploadStatus }),
            ...(update.extractionStatus === undefined
              ? {}
              : { extractionStatus: update.extractionStatus }),
            ...(update.analysisStatus === undefined
              ? {}
              : { analysisStatus: update.analysisStatus }),
            ...(update.processingError === undefined
              ? {}
              : { processingError: update.processingError }),
            ...(update.requiresExtractionMetrics === undefined
              ? {}
              : {
                  requiresExtractionMetrics: update.requiresExtractionMetrics,
                }),
          },
          select: sourceSelection,
        });
        return toProviderSourceDocument(updated);
      });
    },
    async delete(projectId, sourceId) {
      await inLockedProjectTransaction(projectId, async (transaction) => {
        const deleted = await transaction.sourceDocument.deleteMany({
          where: { id: sourceId, projectId },
        });
        if (deleted.count !== 1) {
          throw new Error("Source not found");
        }
      });
    },
  };
}
