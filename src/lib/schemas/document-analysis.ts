import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import {
  EvidenceItemSchema,
  SourceRoleSchema,
  StableIdSchema,
  TimestampSchema,
} from "./shared";

const FindingListSchema = z
  .array(EvidenceItemSchema)
  .max(SCHEMA_LIMITS.findingsPerCategory);

export const DocumentAnalysisSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    projectId: StableIdSchema,
    documentId: StableIdSchema,
    documentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hash"),
    classification: z.strictObject({
      role: SourceRoleSchema,
      confidence: z.number().min(0).max(1),
    }),
    coverage: z
      .strictObject({
        pageCount: z.number().int().positive().optional(),
        analyzedPages: z.number().int().nonnegative().optional(),
        extractionWarnings: z
          .array(z.string().trim().min(1).max(SCHEMA_LIMITS.shortText))
          .max(SCHEMA_LIMITS.stringListItems),
      })
      .refine(
        ({ analyzedPages, pageCount }) =>
          analyzedPages === undefined ||
          pageCount === undefined ||
          analyzedPages <= pageCount,
        {
          path: ["analyzedPages"],
          message: "Analyzed pages cannot exceed extracted pages",
        },
      ),
    findings: z.strictObject({
      topics: FindingListSchema,
      objectives: FindingListSchema,
      terminology: FindingListSchema,
      acceptedMethods: FindingListSchema,
      exercises: FindingListSchema,
      assessmentCriteria: FindingListSchema,
      protectedSolutions: FindingListSchema,
      misconceptions: FindingListSchema,
      pedagogicalPatterns: FindingListSchema,
    }),
    summary: z.string().trim().min(1).max(SCHEMA_LIMITS.summary),
    analyzedAt: TimestampSchema,
  })
  .superRefine((analysis, context) => {
    for (const [category, findings] of Object.entries(analysis.findings)) {
      for (const [findingIndex, finding] of findings.entries()) {
        for (const [evidenceIndex, evidence] of finding.evidence.entries()) {
          const path = [
            "findings",
            category,
            findingIndex,
            "evidence",
            evidenceIndex,
          ];

          if (evidence.documentId !== analysis.documentId) {
            context.addIssue({
              code: "custom",
              path: [...path, "documentId"],
              message: "Analysis evidence must reference its source document",
            });
          }

          if (
            evidence.documentAnalysisId !== undefined &&
            evidence.documentAnalysisId !== analysis.id
          ) {
            context.addIssue({
              code: "custom",
              path: [...path, "documentAnalysisId"],
              message: "Evidence analysis ID must match the containing analysis",
            });
          }
        }
      }
    }
  });

export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

export function parseDocumentAnalysis(input: unknown): DocumentAnalysis {
  return DocumentAnalysisSchema.parse(input);
}
