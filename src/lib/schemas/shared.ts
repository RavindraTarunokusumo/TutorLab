import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";

export const StableIdSchema = z
  .string()
  .min(1)
  .max(SCHEMA_LIMITS.id)
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "IDs must be stable lowercase tokens separated by hyphens or underscores",
  );

export const TimestampSchema = z.iso.datetime({ offset: true });

export const SourceRoleSchema = z.enum([
  "syllabus",
  "lecture",
  "exercise",
  "assessment",
  "rubric",
  "solution",
  "teacher_note",
  "other",
]);

export const SourceAuthoritySchema = z.enum([
  "teacher_instruction",
  "course_authoritative",
  "supplementary",
  "observational",
]);

export const DisclosureLabelSchema = z.enum([
  "never_reveal",
  "reveal_after_sufficient_attempts",
  "available_in_revision_mode",
]);

export const ProvenanceKindSchema = z.enum([
  "source_grounded",
  "teacher_supplied",
  "model_inferred",
]);

export const EvidenceRefSchema = z.strictObject({
  documentId: StableIdSchema,
  documentAnalysisId: StableIdSchema.optional(),
  excerptId: StableIdSchema,
  page: z.number().int().positive().optional(),
  section: z.string().trim().min(1).max(SCHEMA_LIMITS.label).optional(),
  locatorLabel: z.string().trim().min(1).max(SCHEMA_LIMITS.locator),
});

export const RequiredEvidenceSchema = z
  .array(EvidenceRefSchema)
  .min(1)
  .max(SCHEMA_LIMITS.evidencePerItem);

export const OptionalEvidenceSchema = z
  .array(EvidenceRefSchema)
  .max(SCHEMA_LIMITS.evidencePerItem);

export const EvidenceItemSchema = z.strictObject({
  id: StableIdSchema,
  label: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
  description: z.string().trim().min(1).max(SCHEMA_LIMITS.longText),
  provenance: ProvenanceKindSchema,
  evidence: RequiredEvidenceSchema,
  confidence: z.number().min(0).max(1),
});

export type SourceRole = z.infer<typeof SourceRoleSchema>;
export type SourceAuthority = z.infer<typeof SourceAuthoritySchema>;
export type DisclosureLabel = z.infer<typeof DisclosureLabelSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

