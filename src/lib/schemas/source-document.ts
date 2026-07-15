import { z } from "zod";
import { DEFAULT_WORKSPACE_BUDGET, SCHEMA_LIMITS } from "./constants";
import {
  SourceAuthoritySchema,
  SourceRoleSchema,
  StableIdSchema,
} from "./shared";

export const ProcessingStatusSchema = z.enum([
  "pending",
  "in_progress",
  "ready",
  "failed",
]);

export const SourcePermissionsSchema = z.strictObject({
  useForCourseModel: z.boolean(),
  useForPedagogyDrafting: z.boolean(),
  useForRuntimeRetrieval: z.boolean(),
  useForEvaluation: z.boolean(),
  revealExcerptsToStudents: z.boolean(),
});

export const WorkspaceBudgetSchema = z.strictObject({
  maxFiles: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_WORKSPACE_BUDGET.maxFiles)
    .default(DEFAULT_WORKSPACE_BUDGET.maxFiles),
  maxPages: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_WORKSPACE_BUDGET.maxPages)
    .default(DEFAULT_WORKSPACE_BUDGET.maxPages),
  maxExtractedTokens: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens)
    .default(DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens),
  maxBytesPerFile: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile)
    .default(DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile),
  maxWorkspaceBytes: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes)
    .default(DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes),
});

export const SourceDocumentSchema = z.strictObject({
  id: StableIdSchema,
  projectId: StableIdSchema,
  name: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
  role: SourceRoleSchema,
  authority: SourceAuthoritySchema,
  permissions: SourcePermissionsSchema,
  containsProtectedSolutions: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hash"),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/json",
  ]),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile),
  processing: z
    .strictObject({
      uploadStatus: ProcessingStatusSchema,
      extractionStatus: ProcessingStatusSchema,
      analysisStatus: ProcessingStatusSchema,
      pageCount: z.number().int().positive().optional(),
      extractedTokenCount: z.number().int().nonnegative().optional(),
      error: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText).optional(),
    })
    .superRefine((processing, context) => {
      const failed = [
        processing.uploadStatus,
        processing.extractionStatus,
        processing.analysisStatus,
      ].includes("failed");

      if (failed !== Boolean(processing.error)) {
        context.addIssue({
          code: "custom",
          path: ["error"],
          message: "A safe error is required only when processing has failed",
        });
      }
    }),
});

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
export type SourcePermissions = z.infer<typeof SourcePermissionsSchema>;
export type WorkspaceBudget = z.infer<typeof WorkspaceBudgetSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export function parseWorkspaceBudget(input: unknown): WorkspaceBudget {
  return WorkspaceBudgetSchema.parse(input);
}

export function parseSourceDocument(input: unknown): SourceDocument {
  return SourceDocumentSchema.parse(input);
}
