import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { StableIdSchema, TimestampSchema } from "./shared";
import { AssistanceStateSchema, TeachingMoveSchema } from "./tutor-design";

export const SafeUsageMetadataSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export const TutorCitationSchema = z.strictObject({
  documentId: StableIdSchema,
  title: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
});

export const TutorReplyMetadataSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    teachingMove: TeachingMoveSchema,
    currentState: AssistanceStateSchema,
    nextState: AssistanceStateSchema,
    citations: z.array(TutorCitationSchema).max(12),
    boundary: z.enum(["none", "off_topic", "out_of_scope", "protected_solution"]),
    stateFallback: z.strictObject({
      applied: z.boolean(),
      reason: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText).optional(),
    }),
    usage: SafeUsageMetadataSchema,
  })
  .superRefine((metadata, context) => {
    if (metadata.stateFallback.applied !== Boolean(metadata.stateFallback.reason)) {
      context.addIssue({
        code: "custom",
        path: ["stateFallback"],
        message: "State fallback reasons are required only when a fallback was applied",
      });
    }
    if (new Set(metadata.citations.map(({ documentId }) => documentId)).size !== metadata.citations.length) {
      context.addIssue({ code: "custom", path: ["citations"], message: "Reply citations must use unique document IDs" });
    }
  });

export const ConversationMessageSchema = z.strictObject({
  id: StableIdSchema,
  role: z.enum(["learner", "tutor"]),
  content: z.string().trim().min(1).max(SCHEMA_LIMITS.longText),
  metadata: TutorReplyMetadataSchema.optional(),
  createdAt: TimestampSchema,
}).superRefine((message, context) => {
  if ((message.role === "tutor") !== Boolean(message.metadata)) {
    context.addIssue({
      code: "custom",
      path: ["metadata"],
      message: "Only tutor messages require reply metadata",
    });
  }
});

export const ConversationSchema = z.strictObject({
  schemaVersion: z.literal("0.1"),
  id: StableIdSchema,
  projectId: StableIdSchema,
  tutorVersionId: StableIdSchema,
  mode: z.enum(["teacher_preview", "student"]),
  currentState: AssistanceStateSchema,
  messages: z.array(ConversationMessageSchema).max(100),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type SafeUsageMetadata = z.infer<typeof SafeUsageMetadataSchema>;
export type TutorCitation = z.infer<typeof TutorCitationSchema>;
export type TutorReplyMetadata = z.infer<typeof TutorReplyMetadataSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

export function parseTutorReplyMetadata(input: unknown): TutorReplyMetadata {
  return TutorReplyMetadataSchema.parse(input);
}
