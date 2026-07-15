import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { DisclosureLabelSchema, StableIdSchema } from "./shared";

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

export const TeachingBriefAssistanceStepSchema = z.strictObject({
  defaultDisclosure: DisclosureLabelSchema,
  assessedWorkDisclosure: DisclosureLabelSchema,
  requireReasoningBeforeAnswer: z.boolean(),
});

export const TeachingBriefStyleStepSchema = z.strictObject({
  tone: z.enum(["encouraging", "neutral", "formal"]),
  responseLength: z.enum(["concise", "balanced", "detailed"]),
  questioningPreference: z.enum([
    "questions_first",
    "balanced",
    "explanations_first",
  ]),
  learnerSupports: z
    .array(
      z.enum([
        "worked_examples",
        "visual_analogies",
        "step_by_step",
        "retrieval_prompts",
        "teach_back",
      ]),
    )
    .max(5),
});

export const TeachingBriefSchema = z.strictObject({
  schemaVersion: z.literal("0.1"),
  projectId: StableIdSchema,
  context: TeachingBriefContextStepSchema,
  purpose: TeachingBriefPurposeStepSchema.shape.purpose,
  objectives: TeachingBriefObjectivesStepSchema.shape.objectives,
  assistanceBoundaries: TeachingBriefAssistanceStepSchema,
  style: TeachingBriefStyleStepSchema,
  completedSteps: z
    .array(z.enum(["context", "purpose", "objectives", "assistance", "style"]))
    .max(5),
});

export type TeachingBrief = z.infer<typeof TeachingBriefSchema>;

export function parseTeachingBrief(input: unknown): TeachingBrief {
  return TeachingBriefSchema.parse(input);
}

