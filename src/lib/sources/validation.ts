import { createHash } from "node:crypto";
import "server-only";
import {
  DEFAULT_WORKSPACE_BUDGET,
  SourceAuthoritySchema,
  SourcePermissionsSchema,
  SourceRoleSchema,
  type SourceAuthority,
  type SourceDocument,
  type SourcePermissions,
  type SourceRole,
  type WorkspaceBudget,
} from "@/lib/schemas";
import {
  evaluateWorkspaceBudget,
  type BudgetDecision,
  type WorkspaceBudgetUsage,
} from "./budgets";

export type SourceCandidate = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  extractedTokenCount?: number;
  role: string;
  authority: string;
  permissions: SourcePermissions;
  containsProtectedSolutions: boolean;
  contentHash: string;
};

export type SourceValidationCode =
  | "SOURCE_VALID"
  | "INVALID_SOURCE_METADATA"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_SIZE_LIMIT_EXCEEDED"
  | "SOURCE_ROLE_UNSUPPORTED"
  | "SOURCE_AUTHORITY_REQUIRED"
  | "SOURCE_PERMISSIONS_REQUIRED"
  | "PROTECTED_SOURCE_PERMISSION_DENIED"
  | "DUPLICATE_SOURCE_CONTENT"
  | "EXTRACTED_TOKEN_COUNT_REQUIRED"
  | BudgetDecision["code"];

export type ValidationResult =
  | { valid: true; code: "SOURCE_VALID"; message: string; budget: BudgetDecision }
  | { valid: false; code: Exclude<SourceValidationCode, "SOURCE_VALID">; message: string };

export class SourceValidationError extends Error {
  constructor(
    readonly code: Exclude<SourceValidationCode, "SOURCE_VALID">,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
  }
}

const supportedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/json",
]);

const messages = {
  invalid: "This source metadata is invalid.",
  unsupportedType: "This file type is not supported.",
  fileTooLarge: "This file exceeds the per-file size limit.",
  role: "This source role is not supported.",
  authority: "Choose a source authority before continuing.",
  permissions: "Choose permissions for this source before continuing.",
  protected: "Protected solutions cannot be used for student retrieval or excerpts.",
  duplicate: "This file has already been added to this workspace.",
  valid: "This source can be added to the workspace.",
} as const;

function rejected(
  code: Exclude<SourceValidationCode, "SOURCE_VALID">,
  message: string,
): ValidationResult {
  return { valid: false, code, message };
}

export function hashSourceContent(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function validateSourceCandidate(
  candidate: SourceCandidate,
  usage: WorkspaceBudgetUsage,
  budget: WorkspaceBudget = DEFAULT_WORKSPACE_BUDGET,
): ValidationResult {
  if (
    !candidate.name.trim() ||
    !Number.isSafeInteger(candidate.sizeBytes) ||
    candidate.sizeBytes < 0
  ) {
    return rejected("INVALID_SOURCE_METADATA", messages.invalid);
  }
  if (!supportedMimeTypes.has(candidate.mimeType)) {
    return rejected("UNSUPPORTED_FILE_TYPE", messages.unsupportedType);
  }
  if (candidate.sizeBytes > budget.maxBytesPerFile) {
    return rejected("FILE_SIZE_LIMIT_EXCEEDED", messages.fileTooLarge);
  }
  if (!SourceRoleSchema.safeParse(candidate.role).success) {
    return rejected("SOURCE_ROLE_UNSUPPORTED", messages.role);
  }
  if (!SourceAuthoritySchema.safeParse(candidate.authority).success) {
    return rejected("SOURCE_AUTHORITY_REQUIRED", messages.authority);
  }
  if (!SourcePermissionsSchema.safeParse(candidate.permissions).success) {
    return rejected("SOURCE_PERMISSIONS_REQUIRED", messages.permissions);
  }
  if (
    candidate.containsProtectedSolutions &&
    (candidate.permissions.useForRuntimeRetrieval ||
      candidate.permissions.revealExcerptsToStudents)
  ) {
    return rejected("PROTECTED_SOURCE_PERMISSION_DENIED", messages.protected);
  }
  if (usage.contentHashes.includes(candidate.contentHash)) {
    return rejected("DUPLICATE_SOURCE_CONTENT", messages.duplicate);
  }
  if (
    (candidate.pageCount !== undefined &&
      (!Number.isSafeInteger(candidate.pageCount) || candidate.pageCount <= 0)) ||
    (candidate.extractedTokenCount !== undefined &&
      (!Number.isSafeInteger(candidate.extractedTokenCount) ||
        candidate.extractedTokenCount < 0))
  ) {
    return rejected("INVALID_SOURCE_METADATA", messages.invalid);
  }

  const budgetDecision = evaluateWorkspaceBudget(
    usage,
    {
      fileCount: 1,
      workspaceBytes: candidate.sizeBytes,
      pageCount: candidate.pageCount,
      extractedTokenCount: candidate.extractedTokenCount,
      unknownPageCount: candidate.pageCount === undefined ? 1 : 0,
      unknownExtractedTokenCount:
        candidate.extractedTokenCount === undefined ? 1 : 0,
    },
    budget,
  );
  if (!budgetDecision.allowed) {
    return rejected(budgetDecision.code, budgetDecision.message);
  }

  return {
    valid: true,
    code: "SOURCE_VALID",
    message: messages.valid,
    budget: budgetDecision,
  };
}

export type CreateSourceMetadataInput = Omit<SourceCandidate, "contentHash" | "sizeBytes"> & {
  id: string;
  projectId: string;
  bytes: Uint8Array;
  usage: WorkspaceBudgetUsage;
  budget?: WorkspaceBudget;
};

export async function createSourceMetadata(
  input: CreateSourceMetadataInput,
): Promise<SourceDocument> {
  const contentHash = hashSourceContent(input.bytes);
  const result = validateSourceCandidate(
    { ...input, contentHash, sizeBytes: input.bytes.byteLength },
    input.usage,
    input.budget,
  );
  if (!result.valid) {
    throw new SourceValidationError(result.code, result.message);
  }

  return {
    id: input.id,
    projectId: input.projectId,
    name: input.name.trim(),
    role: input.role as SourceRole,
    authority: input.authority as SourceAuthority,
    permissions: input.permissions,
    containsProtectedSolutions: input.containsProtectedSolutions,
    contentHash,
    mimeType: input.mimeType as SourceDocument["mimeType"],
    sizeBytes: input.bytes.byteLength,
    processing: {
      uploadStatus: "pending",
      extractionStatus: "pending",
      analysisStatus: "pending",
      ...(input.pageCount === undefined ? {} : { pageCount: input.pageCount }),
      ...(input.extractedTokenCount === undefined
        ? {}
        : { extractedTokenCount: input.extractedTokenCount }),
    },
  };
}
