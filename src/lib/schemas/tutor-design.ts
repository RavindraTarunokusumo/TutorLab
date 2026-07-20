import { z } from "zod";
import { SCHEMA_LIMITS, TUTOR_DESIGN_CANDIDATE_COUNT } from "./constants";
import { RequiredEvidenceSchema, StableIdSchema, TimestampSchema } from "./shared";

const RequiredTextSchema = z.string().trim().min(1).max(SCHEMA_LIMITS.longText);

export const AssistanceStateSchema = z.enum([
  "diagnose",
  "hint_1",
  "hint_2",
  "worked_step",
  "explain",
  "check_understanding",
  "redirect",
  "escalate",
]);

export const TeachingMoveSchema = z.enum([
  "elicit_reasoning",
  "give_conceptual_hint",
  "give_procedural_hint",
  "model_worked_step",
  "explain_concept",
  "check_understanding",
  "summarize_learning",
  "redirect",
  "escalate",
]);

export const TutorCandidateRoleSchema = z.enum([
  "best_fit",
  "strong_alternative",
  "balanced_option",
]);

export const HintEscalationSchema = z.enum(["gradual", "balanced", "direct"]);
export const TutorDesignControlsSchema = z.strictObject({
  diagnoseBeforeExplain: z.boolean(),
  hintEscalation: HintEscalationSchema,
  tone: z.enum(["encouraging", "neutral", "formal"]),
  maxWords: z.number().int().min(50).max(500),
  offTopicHandling: z.enum(["redirect", "brief_redirect", "decline"]),
});

export const TutorDesignSchema = z
  .strictObject({
    id: StableIdSchema,
    archetypeId: StableIdSchema,
    templateVersion: z.literal("0.1"),
    candidateRole: TutorCandidateRoleSchema,
    title: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
    strategySummary: RequiredTextSchema,
    tradeOff: RequiredTextSchema,
    evidence: RequiredEvidenceSchema,
    comparisonLearnerMessage: RequiredTextSchema,
    sampleResponse: RequiredTextSchema,
    controls: TutorDesignControlsSchema,
    permittedAssistanceStates: z.array(AssistanceStateSchema).min(1).max(9),
    permittedTeachingMoves: z.array(TeachingMoveSchema).min(1).max(9),
  })
  .superRefine((design, context) => {
    if (
      new Set(design.permittedAssistanceStates).size !==
      design.permittedAssistanceStates.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["permittedAssistanceStates"],
        message: "Permitted assistance states must be unique",
      });
    }

    if (
      new Set(design.permittedTeachingMoves).size !==
      design.permittedTeachingMoves.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["permittedTeachingMoves"],
        message: "Permitted teaching moves must be unique",
      });
    }
  });

export const TutorDesignExclusionSchema = z.strictObject({
  archetypeId: StableIdSchema,
  reason: RequiredTextSchema,
});

export const TutorDesignSetSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    projectId: StableIdSchema,
    courseModelVersionId: StableIdSchema,
    candidates: z.array(TutorDesignSchema).length(TUTOR_DESIGN_CANDIDATE_COUNT),
    excludedCatalogOptions: z.array(TutorDesignExclusionSchema).max(16),
    generatedAt: TimestampSchema,
  })
  .superRefine((set, context) => {
    const roles = set.candidates.map(({ candidateRole }) => candidateRole);
    const archetypeIds = set.candidates.map(({ archetypeId }) => archetypeId);
    const candidateIds = set.candidates.map(({ id }) => id);
    const excludedIds = set.excludedCatalogOptions.map(({ archetypeId }) => archetypeId);
    const requiredRoles: Array<z.infer<typeof TutorCandidateRoleSchema>> = [
      "best_fit",
      "strong_alternative",
      "balanced_option",
    ];

    if (
      roles.length !== requiredRoles.length ||
      requiredRoles.some((role) => roles.filter((value) => value === role).length !== 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Candidates must contain each recommendation role exactly once",
      });
    }

    if (new Set(archetypeIds).size !== archetypeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Candidates must use unique archetype IDs",
      });
    }

    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Candidate IDs must be unique",
      });
    }

    if (new Set(excludedIds).size !== excludedIds.length) {
      context.addIssue({
        code: "custom",
        path: ["excludedCatalogOptions"],
        message: "Excluded catalog archetype IDs must be unique",
      });
    }

    if (archetypeIds.some((archetypeId) => excludedIds.includes(archetypeId))) {
      context.addIssue({
        code: "custom",
        path: ["excludedCatalogOptions"],
        message: "A selected candidate cannot also be excluded",
      });
    }
  });

export type AssistanceState = z.infer<typeof AssistanceStateSchema>;
export type TeachingMove = z.infer<typeof TeachingMoveSchema>;
export type TutorCandidateRole = z.infer<typeof TutorCandidateRoleSchema>;
export type HintEscalation = z.infer<typeof HintEscalationSchema>;
export type TutorDesignControls = z.infer<typeof TutorDesignControlsSchema>;
export type TutorDesign = z.infer<typeof TutorDesignSchema>;
export type TutorDesignSet = z.infer<typeof TutorDesignSetSchema>;

export function parseTutorDesignSet(input: unknown): TutorDesignSet {
  return TutorDesignSetSchema.parse(input);
}
