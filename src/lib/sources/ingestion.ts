import { randomUUID } from "node:crypto";
import "server-only";
import { z } from "zod";
import {
  SourceAuthoritySchema,
  SourcePermissionsSchema,
  SourceRoleSchema,
  type SourceDocument,
} from "@/lib/schemas";
import {
  getOpenAIFileProvider,
  type OpenAIFileProvider,
  type VectorStoreFileStatus,
} from "@/lib/ai/openai-files";
import {
  getProjectRepository,
  type ProjectRepository,
} from "@/lib/projects/repository";
import {
  getSourceRepository,
  type ProviderSourceDocument,
  type SourceRepository,
} from "./repository";
import {
  extractedPageCountFromContent,
  extractedTokenCountFromContent,
} from "./extraction-metrics";
import { extractPdfText } from "./pdf-extraction";
import { createSourceMetadata, SourceValidationError } from "./validation";

const SourceUploadMetadataSchema = z.strictObject({
  role: SourceRoleSchema,
  authority: SourceAuthoritySchema,
  permissions: SourcePermissionsSchema,
  containsProtectedSolutions: z.boolean(),
}).transform(({ permissions, ...metadata }) => ({
  ...metadata,
  permissions: { ...permissions, useForCourseModel: true },
}));

export type SourceUploadMetadata = z.infer<typeof SourceUploadMetadataSchema>;

export type SourceUploadFile = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type SourceIngestionDependencies = {
  sourceRepository: SourceRepository;
  projectRepository: ProjectRepository;
  provider: OpenAIFileProvider;
  wait: (milliseconds: number) => Promise<void>;
  maxPollAttempts: number;
  pollDelayMs: number;
};

export class SourceNotFoundError extends Error {
  constructor() {
    super("Source not found");
  }
}

function safeFailureMessage(): string {
  return "Source indexing could not be completed. Please retry.";
}

function safeUploadFailureMessage(): string {
  return "Upload did not complete. Upload this source again.";
}

function withDependencies(
  overrides: Partial<SourceIngestionDependencies> | undefined,
): SourceIngestionDependencies {
  return {
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    projectRepository: overrides?.projectRepository ?? getProjectRepository(),
    provider: overrides?.provider ?? getOpenAIFileProvider(),
    wait:
      overrides?.wait ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        })),
    maxPollAttempts: overrides?.maxPollAttempts ?? 3,
    pollDelayMs: overrides?.pollDelayMs ?? 250,
  };
}

export function parseSourceUploadMetadata(input: unknown): SourceUploadMetadata {
  return SourceUploadMetadataSchema.parse(input);
}

async function bestEffort(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Local source state remains authoritative when provider cleanup is unavailable.
  }
}

function isDuplicateAttachmentError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const providerError = error as { status?: unknown; code?: unknown };
  return (
    providerError.status === 409 ||
    providerError.code === "already_exists" ||
    providerError.code === "vector_store_file_exists"
  );
}

function isMissingAttachmentError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { status?: unknown }).status === 404;
}

async function ensureVectorStore(
  projectId: string,
  dependencies: SourceIngestionDependencies,
): Promise<string> {
  const existing = await dependencies.projectRepository.findVectorStoreId(projectId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < dependencies.maxPollAttempts; attempt += 1) {
    const token = randomUUID();
    const reservation =
      await dependencies.projectRepository.acquireVectorStoreProvisioning(
        projectId,
        token,
        new Date(Date.now() - 5 * 60_000),
      );
    if (reservation.vectorStoreId) {
      return reservation.vectorStoreId;
    }
    if (!reservation.acquired) {
      await dependencies.wait(dependencies.pollDelayMs * (attempt + 1));
      continue;
    }

    let createdId: string | undefined;
    try {
      const created = await dependencies.provider.createVectorStore({
        name: `TutorLab project ${projectId}`,
      });
      createdId = created.id;
      const completed =
        await dependencies.projectRepository.completeVectorStoreProvisioning(
          projectId,
          token,
          created.id,
        );
      if (!completed) {
        throw new Error("Vector store provisioning was not completed");
      }
      if (completed !== created.id) {
        await bestEffort(() => dependencies.provider.deleteVectorStore(created.id));
      }
      return completed;
    } catch (error) {
      let reconciled: string | null = null;
      let reconciliationKnown = false;
      if (createdId) {
        try {
          reconciled = await dependencies.projectRepository.findVectorStoreId(projectId);
          reconciliationKnown =
            reconciled === null || typeof reconciled === "string";
        } catch {
          reconciliationKnown = false;
        }
      }
      if (createdId && reconciliationKnown && reconciled === createdId) {
        return createdId;
      }
      if (createdId && reconciliationKnown) {
        const orphanedId = createdId;
        await bestEffort(() => dependencies.provider.deleteVectorStore(orphanedId));
      }
      await dependencies.projectRepository.releaseVectorStoreProvisioning(
        projectId,
        token,
      );
      throw error;
    }
  }

  throw new Error("Vector store provisioning is still in progress");
}

async function persistProviderStatus(
  projectId: string,
  sourceId: string,
  progress: VectorStoreFileStatus | { status: VectorStoreFileStatus },
  dependencies: SourceIngestionDependencies,
): Promise<SourceDocument> {
  const normalized =
    typeof progress === "string" ? { status: progress } : progress;
  const { status } = normalized;
  if (status === "completed") {
    throw new Error("Completed source indexing requires extraction metrics");
  }
  if (status === "failed") {
    return (
      await dependencies.sourceRepository.updateIngestion(projectId, sourceId, {
        uploadStatus: "ready",
        extractionStatus: "failed",
        requiresExtractionMetrics: false,
        processingError: safeFailureMessage(),
      })
    ).source;
  }
  return (
    await dependencies.sourceRepository.updateIngestion(projectId, sourceId, {
      uploadStatus: "ready",
      extractionStatus: "in_progress",
      requiresExtractionMetrics: false,
      processingError: null,
    })
  ).source;
}

async function finalizeCompletedIndexing(
  projectId: string,
  sourceId: string,
  vectorStoreId: string,
  openaiFileId: string,
  mimeType: string,
  originalContent: string | undefined,
  dependencies: SourceIngestionDependencies,
): Promise<SourceDocument> {
  const stored = await dependencies.sourceRepository.findById(projectId, sourceId);
  const storedMetrics = stored?.source.processing;
  if (
    storedMetrics?.pageCount !== undefined &&
    storedMetrics.extractedTokenCount !== undefined
  ) {
    return dependencies.sourceRepository.recordExtractionMetrics(projectId, sourceId, {
      pageCount: storedMetrics.pageCount,
      extractedTokenCount: storedMetrics.extractedTokenCount,
      finalized: true,
      requiresExtractionMetrics: false,
    });
  }
  const extractedContent = originalContent ?? await dependencies.provider.getExtractedText(
    vectorStoreId,
    openaiFileId,
    mimeType,
  );
  const extractedTokenCount = extractedTokenCountFromContent(extractedContent);
  const pageCount = extractedPageCountFromContent(extractedContent);
  if (extractedTokenCount === undefined || pageCount === undefined) {
    return (
      await dependencies.sourceRepository.updateIngestion(projectId, sourceId, {
        uploadStatus: "ready",
        extractionStatus: "in_progress",
        requiresExtractionMetrics: true,
        processingError: null,
      })
    ).source;
  }
  return dependencies.sourceRepository.recordExtractionMetrics(projectId, sourceId, {
    pageCount,
    extractedTokenCount,
    finalized: true,
    requiresExtractionMetrics: false,
  });
}

async function pollIndexing(
  projectId: string,
  sourceId: string,
  vectorStoreId: string,
  openaiFileId: string,
  mimeType: string,
  originalContent: string | undefined,
  dependencies: SourceIngestionDependencies,
): Promise<SourceDocument> {
  for (let attempt = 0; attempt < dependencies.maxPollAttempts; attempt += 1) {
    const progress = await dependencies.provider.getFileStatus(
      vectorStoreId,
      openaiFileId,
    );
    const source =
      progress.status === "completed"
        ? await finalizeCompletedIndexing(
            projectId,
            sourceId,
            vectorStoreId,
            openaiFileId,
            mimeType,
            originalContent,
            dependencies,
          )
        : await persistProviderStatus(projectId, sourceId, progress, dependencies);
    if (
      progress.status !== "in_progress" ||
      attempt === dependencies.maxPollAttempts - 1
    ) {
      return source;
    }
    await dependencies.wait(dependencies.pollDelayMs * (attempt + 1));
  }
  throw new Error("Polling did not run");
}

type OriginalContentResult = { content?: string; diagnostic: string };

async function extractOriginalContent(
  file: SourceUploadFile,
): Promise<OriginalContentResult> {
  if (file.mimeType !== "application/pdf") {
    return { diagnostic: `skipped mime=${file.mimeType}` };
  }
  try {
    const content = await extractPdfText(file.bytes);
    return {
      content,
      diagnostic: `ok len=${content.length} ff=${content.includes("\f")}`,
    };
  } catch (error) {
    // TEMP DIAGNOSTIC: surface why extraction fails on the server (logs are
    // unreliable on the current host). Remove once the root cause is fixed.
    return {
      diagnostic:
        error instanceof Error
          ? `threw ${error.name}: ${error.message}`
          : `threw ${String(error)}`,
    };
  }
}

async function sourceOrThrow(
  projectId: string,
  sourceId: string,
  dependencies: SourceIngestionDependencies,
): Promise<ProviderSourceDocument> {
  const source = await dependencies.sourceRepository.findById(projectId, sourceId);
  if (!source) {
    throw new SourceNotFoundError();
  }
  return source;
}

async function sourceByIdOrThrow(
  sourceId: string,
  dependencies: SourceIngestionDependencies,
): Promise<ProviderSourceDocument> {
  const source = await dependencies.sourceRepository.findBySourceId(sourceId);
  if (!source) {
    throw new SourceNotFoundError();
  }
  return source;
}

async function markUploadFailure(
  projectId: string,
  sourceId: string,
  dependencies: SourceIngestionDependencies,
): Promise<SourceDocument> {
  return (
    await dependencies.sourceRepository.updateIngestion(projectId, sourceId, {
      uploadStatus: "failed",
      extractionStatus: "pending",
      requiresExtractionMetrics: false,
      processingError: safeUploadFailureMessage(),
    })
  ).source;
}

async function markIndexingFailure(
  projectId: string,
  sourceId: string,
  dependencies: SourceIngestionDependencies,
  diagnostic?: string,
): Promise<SourceDocument> {
  return (
    await dependencies.sourceRepository.updateIngestion(projectId, sourceId, {
      uploadStatus: "ready",
      extractionStatus: "failed",
      requiresExtractionMetrics: false,
      // TEMP DIAGNOSTIC: when provided, record the real extraction outcome so it
      // can be read from the DB. Falls back to the safe user message otherwise.
      processingError: diagnostic
        ? `[diag] ${diagnostic}`.slice(0, 300)
        : safeFailureMessage(),
    })
  ).source;
}

async function recreateFailedAssociation(
  vectorStoreId: string,
  openaiFileId: string,
  dependencies: SourceIngestionDependencies,
): Promise<void> {
  try {
    await dependencies.provider.detachFile(vectorStoreId, openaiFileId);
  } catch (error) {
    if (!isMissingAttachmentError(error)) {
      throw error;
    }
  }
  try {
    await dependencies.provider.attachFile(vectorStoreId, openaiFileId);
  } catch (error) {
    if (!isDuplicateAttachmentError(error)) {
      throw error;
    }
    await dependencies.provider.detachFile(vectorStoreId, openaiFileId);
    await dependencies.provider.attachFile(vectorStoreId, openaiFileId);
  }
}

export async function ingestSource(
  projectId: string,
  file: SourceUploadFile,
  metadata: SourceUploadMetadata,
  overrides?: Partial<SourceIngestionDependencies>,
): Promise<SourceDocument> {
  const dependencies = withDependencies(overrides);
  const parsedMetadata = parseSourceUploadMetadata(metadata);
  const extraction = await extractOriginalContent(file);
  const originalContent = extraction.content;
  const pageCount = originalContent === undefined
    ? undefined
    : extractedPageCountFromContent(originalContent);
  const extractedTokenCount = originalContent === undefined
    ? undefined
    : extractedTokenCountFromContent(originalContent);
  const usage = await dependencies.sourceRepository.getWorkspaceUsage(projectId);
  const source = await createSourceMetadata({
    id: randomUUID(),
    projectId,
    name: file.name,
    mimeType: file.mimeType,
    bytes: file.bytes,
    usage,
    ...(pageCount === undefined ? {} : { pageCount }),
    ...(extractedTokenCount === undefined ? {} : { extractedTokenCount }),
    ...parsedMetadata,
  });
  await dependencies.sourceRepository.create(source);

  let uploadedId: string | undefined;
  try {
    const uploaded = await dependencies.provider.uploadFile(file);
    uploadedId = uploaded.id;
    await dependencies.sourceRepository.updateIngestion(projectId, source.id, {
      openaiFileId: uploadedId,
      uploadStatus: "ready",
      extractionStatus: "in_progress",
      processingError: null,
    });
    if (
      file.mimeType === "application/pdf" &&
      !parsedMetadata.permissions.useForRuntimeRetrieval
    ) {
      if (pageCount === undefined || extractedTokenCount === undefined) {
        return markIndexingFailure(
          projectId,
          source.id,
          dependencies,
          extraction.diagnostic,
        );
      }
      return dependencies.sourceRepository.recordExtractionMetrics(
        projectId,
        source.id,
        {
          pageCount,
          extractedTokenCount,
          finalized: true,
          requiresExtractionMetrics: false,
        },
      );
    }
    const vectorStoreId = await ensureVectorStore(projectId, dependencies);
    await dependencies.provider.attachFile(vectorStoreId, uploadedId);
    return await pollIndexing(
      projectId,
      source.id,
      vectorStoreId,
      uploadedId,
      source.mimeType,
      originalContent,
      dependencies,
    );
  } catch (error) {
    if (error instanceof SourceValidationError || error instanceof SourceNotFoundError) {
      throw error;
    }
    if (!uploadedId) {
      return markUploadFailure(projectId, source.id, dependencies);
    }
    return markIndexingFailure(projectId, source.id, dependencies);
  }
}

export async function refreshSourceProcessing(
  sourceId: string,
  overrides?: Partial<SourceIngestionDependencies>,
): Promise<SourceDocument> {
  const dependencies = withDependencies(overrides);
  const current = await sourceByIdOrThrow(sourceId, dependencies);
  const projectId = current.source.projectId;
  if (!current.openaiFileId) {
    return markUploadFailure(projectId, sourceId, dependencies);
  }

  try {
    const vectorStoreId = await ensureVectorStore(projectId, dependencies);
    if (current.source.processing.extractionStatus === "failed") {
      await recreateFailedAssociation(
        vectorStoreId,
        current.openaiFileId,
        dependencies,
      );
    }
    return await pollIndexing(
      projectId,
      sourceId,
      vectorStoreId,
      current.openaiFileId,
      current.source.mimeType,
      undefined,
      dependencies,
    );
  } catch {
    return markIndexingFailure(projectId, sourceId, dependencies);
  }
}

export async function listSources(
  projectId: string,
  overrides?: Partial<SourceIngestionDependencies>,
): Promise<SourceDocument[]> {
  const sourceRepository = overrides?.sourceRepository ?? getSourceRepository();
  const sources = await sourceRepository.list(projectId);
  const needsRefresh = sources.some(
    (source) =>
      source.processing.uploadStatus === "ready" &&
      source.processing.extractionStatus === "in_progress",
  );
  if (!needsRefresh) {
    return sources;
  }

  // Building dependencies constructs the OpenAI provider, which requires a key.
  // Under the bring-your-own-key model a request may legitimately have no key
  // (e.g. simply listing sources), so listing must still succeed — it returns
  // the stored statuses without a live refresh rather than failing the request.
  let dependencies: SourceIngestionDependencies;
  try {
    dependencies = withDependencies({ ...overrides, sourceRepository });
  } catch {
    return sources;
  }

  return Promise.all(
    sources.map(async (source) => {
      if (
        source.processing.uploadStatus !== "ready" ||
        source.processing.extractionStatus !== "in_progress"
      ) {
        return source;
      }
      try {
        return await refreshSourceProcessing(source.id, dependencies);
      } catch {
        return source;
      }
    }),
  );
}

export async function removeSource(
  projectId: string,
  sourceId: string,
  overrides?: Partial<SourceIngestionDependencies>,
): Promise<void> {
  const dependencies = withDependencies(overrides);
  const source = await sourceOrThrow(projectId, sourceId, dependencies);
  if (source.openaiFileId) {
    const vectorStoreId = await dependencies.projectRepository.findVectorStoreId(projectId);
    if (vectorStoreId) {
      await bestEffort(() =>
        dependencies.provider.detachFile(vectorStoreId, source.openaiFileId!),
      );
    }
    await bestEffort(() => dependencies.provider.deleteFile(source.openaiFileId!));
  }
  await dependencies.sourceRepository.delete(projectId, sourceId);
}
