import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { StableIdSchema } from "./shared";

const RequiredTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCHEMA_LIMITS.shortText);

export const TeachingBriefContextStepSchema = z.strictObject({
  subject: RequiredTextSchema,
  topic: RequiredTextSchema,
  studentLevel: RequiredTextSchema,
  language: RequiredTextSchema,
});

export const TeachingBriefPurposeStepSchema = z.strictObject({
  purpose: z.enum([
    "conceptual_learning",
    "guided_practice",
    "revision",
    "exam_preparation",
  ]),
});

export const TeachingBriefObjectivesStepSchema = z.strictObject({
  objectives: z
    .array(RequiredTextSchema)
    .min(1)
    .max(SCHEMA_LIMITS.stringListItems),
});

export const TeachingBriefStyleStepSchema = z.strictObject({
  tone: z.enum(["encouraging", "neutral", "formal"]),
  responseLength: z.enum(["concise", "balanced", "detailed"]),
});

export const TeachingBriefSchema = z.strictObject({
  schemaVersion: z.literal("0.1"),
  projectId: StableIdSchema,
  context: TeachingBriefContextStepSchema,
  purpose: TeachingBriefPurposeStepSchema.shape.purpose,
  objectives: TeachingBriefObjectivesStepSchema.shape.objectives,
  style: TeachingBriefStyleStepSchema,
  completedSteps: z
    .array(z.enum(["context", "purpose", "objectives", "style"]))
    .max(4),
});

export type TeachingBrief = z.infer<typeof TeachingBriefSchema>;

export function parseTeachingBrief(input: unknown): TeachingBrief {
  return TeachingBriefSchema.parse(input);
}
