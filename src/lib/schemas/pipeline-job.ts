import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { StableIdSchema, TimestampSchema } from "./shared";

export const PipelineStageSchema = z.enum([
  "upload",
  "extraction",
  "analysis",
  "synthesis",
]);

export const PipelineJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const PipelineJobSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    projectId: StableIdSchema,
    sourceDocumentId: StableIdSchema.optional(),
    stage: PipelineStageSchema,
    idempotencyKey: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
    status: PipelineJobStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    progress: z.number().min(0).max(1),
    diagnostic: z
      .strictObject({
        code: StableIdSchema,
        message: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText),
        retryable: z.boolean(),
      })
      .optional(),
    usage: z
      .strictObject({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    resultId: StableIdSchema.optional(),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
  })
  .superRefine((job, context) => {
    const terminal = job.status === "completed" || job.status === "failed";

    if (terminal && !job.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Terminal jobs require a completion timestamp",
      });
    }

    if (!terminal && job.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Nonterminal jobs cannot have a completion timestamp",
      });
    }

    if (job.status === "completed" && job.progress !== 1) {
      context.addIssue({
        code: "custom",
        path: ["progress"],
        message: "Completed jobs must report 100% progress",
      });
    }

    if (job.status === "failed" && !job.diagnostic) {
      context.addIssue({
        code: "custom",
        path: ["diagnostic"],
        message: "Failed jobs require a safe diagnostic",
      });
    }

    if (job.status !== "failed" && job.diagnostic) {
      context.addIssue({
        code: "custom",
        path: ["diagnostic"],
        message: "Only failed jobs may include a diagnostic",
      });
    }

    if (
      job.startedAt &&
      job.completedAt &&
      Date.parse(job.completedAt) < Date.parse(job.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "A job cannot complete before it starts",
      });
    }
  });

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineJobStatus = z.infer<typeof PipelineJobStatusSchema>;
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

export function parsePipelineJob(input: unknown): PipelineJob {
  return PipelineJobSchema.parse(input);
}
