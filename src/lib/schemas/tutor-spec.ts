import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import {
  AssistanceStateSchema,
  HintEscalationSchema,
  TeachingMoveSchema,
} from "./tutor-design";
import { StableIdSchema } from "./shared";

const LabelSchema = z.string().trim().min(1).max(SCHEMA_LIMITS.label);
const RequiredTextSchema = z.string().trim().min(1).max(SCHEMA_LIMITS.longText);

export const TutorSpecSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    projectId: StableIdSchema,
    tutorId: StableIdSchema,
    version: z.number().int().positive(),
    courseModelVersionId: StableIdSchema,
    selectedDesign: z.strictObject({
      designId: StableIdSchema,
      archetypeId: StableIdSchema,
      templateVersion: z.literal("0.1"),
    }),
    learningContract: z.strictObject({
      title: LabelSchema,
      subject: LabelSchema,
      studentLevel: LabelSchema,
      language: LabelSchema,
      objectives: z.array(RequiredTextSchema).min(1).max(SCHEMA_LIMITS.stringListItems),
    }),
    pedagogy: z.strictObject({
      diagnoseBeforeExplain: z.boolean(),
      hintEscalation: HintEscalationSchema,
      permittedAssistanceStates: z.array(AssistanceStateSchema).min(1).max(9),
      permittedTeachingMoves: z.array(TeachingMoveSchema).min(1).max(9),
    }),
    responseStyle: z.strictObject({
      tone: z.enum(["encouraging", "neutral", "formal"]),
      maxWords: z.number().int().min(50).max(500),
    }),
    boundaries: z.strictObject({
      offTopic: z.enum(["redirect", "brief_redirect", "decline"]),
      outOfScope: z.enum(["state_limit_and_redirect", "redirect_to_teacher"]),
      revealProtectedSolutions: z.literal(false),
    }),
    hardConstraints: z.array(RequiredTextSchema).min(1).max(32),
    courseManifest: z.array(z.strictObject({
      documentId: StableIdSchema,
      title: LabelSchema,
    })).min(1).max(SCHEMA_LIMITS.courseItemsPerCategory),
    runtimeRetrieval: z.strictObject({
      citationsRequired: z.boolean(),
      maxPassages: z.number().int().positive().max(12),
      permittedDocumentIds: z.array(StableIdSchema).max(SCHEMA_LIMITS.courseItemsPerCategory),
    }),
    evaluation: z.strictObject({
      responseWordTolerance: z.number().int().min(0).max(100),
      requireGroundedCourseClaims: z.boolean(),
    }),
  })
  .superRefine((spec, context) => {
    const stateIds = spec.pedagogy.permittedAssistanceStates;
    const moveIds = spec.pedagogy.permittedTeachingMoves;
    const manifestIds = spec.courseManifest.map(({ documentId }) => documentId);
    const retrievalIds = spec.runtimeRetrieval.permittedDocumentIds;

    if (new Set(stateIds).size !== stateIds.length) {
      context.addIssue({ code: "custom", path: ["pedagogy", "permittedAssistanceStates"], message: "Permitted assistance states must be unique" });
    }
    if (new Set(moveIds).size !== moveIds.length) {
      context.addIssue({ code: "custom", path: ["pedagogy", "permittedTeachingMoves"], message: "Permitted teaching moves must be unique" });
    }
    if (new Set(manifestIds).size !== manifestIds.length) {
      context.addIssue({ code: "custom", path: ["courseManifest"], message: "Course manifest document IDs must be unique" });
    }
    if (new Set(retrievalIds).size !== retrievalIds.length) {
      context.addIssue({ code: "custom", path: ["runtimeRetrieval", "permittedDocumentIds"], message: "Permitted runtime retrieval document IDs must be unique" });
    }
    if (retrievalIds.some((id) => !manifestIds.includes(id))) {
      context.addIssue({ code: "custom", path: ["runtimeRetrieval", "permittedDocumentIds"], message: "Runtime retrieval documents must appear in the course manifest" });
    }
  });

export type TutorSpec = z.infer<typeof TutorSpecSchema>;

export function parseTutorSpec(input: unknown): TutorSpec {
  return TutorSpecSchema.parse(input);
}
