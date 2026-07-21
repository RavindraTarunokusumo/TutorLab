import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { StableIdSchema } from "./shared";
import { LANGUAGE_CODES, STUDENT_LEVELS, SUBJECTS, topicsForSubject } from "@/lib/teaching-brief/catalogs";

const RequiredTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCHEMA_LIMITS.shortText);

const ContextShape = z.strictObject({
  subject: z.enum(SUBJECTS.map(([id]) => id) as [string, ...string[]]),
  topic: RequiredTextSchema,
  topicOther: RequiredTextSchema.optional(),
  studentLevel: z.enum(STUDENT_LEVELS.map(([id]) => id) as [string, ...string[]]),
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
}).superRefine((context, refinement) => {
  const topics = topicsForSubject(context.subject);
  if (!topics.some(([id]) => id === context.topic)) refinement.addIssue({ code: "custom", path: ["topic"], message: "Choose a topic for the selected subject" });
  if (context.topic === "other-topic" && !context.topicOther?.trim()) refinement.addIssue({ code: "custom", path: ["topicOther"], message: "Describe the main topic" });
});

const LEGACY_CONTEXT_ALIASES: Record<string, Record<string, string>> = {
  subject: { mathematics: "mathematics" },
  topic: { probability: "statistics-probability" },
  studentLevel: { introductory: "undergraduate", "first year": "undergraduate" },
  language: { english: "en" },
};

export const TeachingBriefContextStepSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = { ...(value as Record<string, unknown>) };
  for (const field of ["subject", "topic", "studentLevel", "language"] as const) {
    const current = normalized[field];
    if (typeof current !== "string") continue;
    normalized[field] = LEGACY_CONTEXT_ALIASES[field]?.[current.trim().toLocaleLowerCase()] ?? current.trim();
  }
  return normalized;
}, ContextShape);

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

export const TeachingBriefStyleStepSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const style = { ...(value as Record<string, unknown>) };
  delete style.responseLength;
  return style;
}, z.strictObject({
  tone: z.enum(["encouraging", "neutral", "formal"]),
}));

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
