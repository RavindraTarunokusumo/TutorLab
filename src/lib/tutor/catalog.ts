import type {
  AssistanceState,
  CourseModel,
  PedagogicalObservation,
  TeachingMove,
  TutorDesign,
  TutorDesignControls,
} from "@/lib/schemas";

export const TUTOR_CATALOG_TEMPLATE_VERSION = "0.1" as const;

export type TutorCatalogTemplate = {
  archetypeId: "socratic" | "guided-practice" | "inquiry-case-based";
  templateVersion: typeof TUTOR_CATALOG_TEMPLATE_VERSION;
  title: string;
  strategySummary: string;
  tradeOff: string;
  defaultControls: TutorDesignControls;
  permittedAssistanceStates: readonly AssistanceState[];
  permittedTeachingMoves: readonly TeachingMove[];
  defaultConstraints: readonly string[];
  evaluationExpectations: readonly string[];
  relevantObservations: readonly PedagogicalObservation["observation"][];
};

const SOCrATIC_TEMPLATE: TutorCatalogTemplate = {
  archetypeId: "socratic",
  templateVersion: TUTOR_CATALOG_TEMPLATE_VERSION,
  title: "Socratic Concept Tutor",
  strategySummary:
    "Elicits the learner's reasoning, diagnoses misconceptions, and uses concise conceptual prompts before explaining.",
  tradeOff:
    "It can require more turns when a learner wants rapid procedural revision.",
  defaultControls: {
    diagnoseBeforeExplain: true,
    hintEscalation: "gradual",
    answerPolicy: "never_reveal",
    tone: "encouraging",
    maxWords: 140,
    offTopicHandling: "redirect",
  },
  permittedAssistanceStates: [
    "diagnose",
    "hint_1",
    "explain",
    "check_understanding",
    "redirect",
    "escalate",
  ],
  permittedTeachingMoves: [
    "elicit_reasoning",
    "give_conceptual_hint",
    "explain_concept",
    "check_understanding",
    "summarize_learning",
    "redirect",
    "escalate",
  ],
  defaultConstraints: [
    "Ask for the learner's reasoning before correcting a misconception.",
    "Use conceptual hints rather than supplying protected final answers.",
  ],
  evaluationExpectations: [
    "Confident misconceptions receive a diagnostic question before correction.",
    "Unsupported claims state the source limit instead of inventing an explanation.",
  ],
  relevantObservations: [
    "common_misconception",
    "reasoning_before_calculation",
    "conceptual_justification_required",
  ],
};

const GUIDED_PRACTICE_TEMPLATE: TutorCatalogTemplate = {
  archetypeId: "guided-practice",
  templateVersion: TUTOR_CATALOG_TEMPLATE_VERSION,
  title: "Hint-Ladder Problem Coach",
  strategySummary:
    "Moves through a deliberate hint ladder, giving increasingly explicit support while keeping the learner responsible for the solution.",
  tradeOff:
    "It is less efficient for broad concept review than a direct explanatory tutor.",
  defaultControls: {
    diagnoseBeforeExplain: true,
    hintEscalation: "gradual",
    answerPolicy: "never_reveal",
    tone: "encouraging",
    maxWords: 120,
    offTopicHandling: "brief_redirect",
  },
  permittedAssistanceStates: [
    "diagnose",
    "hint_1",
    "hint_2",
    "worked_step",
    "check_understanding",
    "redirect",
    "escalate",
  ],
  permittedTeachingMoves: [
    "elicit_reasoning",
    "give_conceptual_hint",
    "give_procedural_hint",
    "model_worked_step",
    "check_understanding",
    "summarize_learning",
    "redirect",
    "escalate",
  ],
  defaultConstraints: [
    "Escalate one hint level at a time after a learner attempt.",
    "A worked step must be analogous or partial and must not disclose a protected final answer.",
  ],
  evaluationExpectations: [
    "A learner stuck after two hints receives a permitted partial worked step or escalation.",
    "Correct results with invalid reasoning trigger a reasoning check rather than automatic approval.",
  ],
  relevantObservations: [
    "method_marks_emphasized",
    "consistent_solution_sequence",
    "assessment_answer_sensitive",
  ],
};

const INQUIRY_CASE_BASED_TEMPLATE: TutorCatalogTemplate = {
  archetypeId: "inquiry-case-based",
  templateVersion: TUTOR_CATALOG_TEMPLATE_VERSION,
  title: "Inquiry and Case-Based Guide",
  strategySummary:
    "Uses a bounded scenario or case to help learners form hypotheses, connect evidence, and test their explanations.",
  tradeOff:
    "It needs clear milestones and can feel indirect for tightly constrained procedural tasks.",
  defaultControls: {
    diagnoseBeforeExplain: false,
    hintEscalation: "balanced",
    answerPolicy: "reveal_after_sufficient_attempts",
    tone: "neutral",
    maxWords: 180,
    offTopicHandling: "redirect",
  },
  permittedAssistanceStates: [
    "diagnose",
    "hint_1",
    "hint_2",
    "worked_step",
    "explain",
    "check_understanding",
    "redirect",
    "escalate",
  ],
  permittedTeachingMoves: [
    "elicit_reasoning",
    "give_conceptual_hint",
    "give_procedural_hint",
    "model_worked_step",
    "explain_concept",
    "check_understanding",
    "summarize_learning",
    "redirect",
    "escalate",
  ],
  defaultConstraints: [
    "Keep inquiry inside an approved course case or source-grounded scenario.",
    "Require a learner hypothesis or evidence check before completing the case.",
  ],
  evaluationExpectations: [
    "Learners are asked to connect a claim to case evidence before a conclusion is accepted.",
    "Out-of-scope cases are redirected instead of inviting unsupported speculation.",
  ],
  relevantObservations: [
    "worked_examples_frequently_used",
    "conceptual_justification_required",
    "formal_notation_required",
  ],
};

export const TUTOR_CATALOG: readonly TutorCatalogTemplate[] = [
  SOCrATIC_TEMPLATE,
  GUIDED_PRACTICE_TEMPLATE,
  INQUIRY_CASE_BASED_TEMPLATE,
];

export type TutorCatalogArchetypeId = TutorCatalogTemplate["archetypeId"];

export function listTutorCatalog(): readonly TutorCatalogTemplate[] {
  return TUTOR_CATALOG;
}

export function getTutorCatalogTemplate(
  archetypeId: string,
): TutorCatalogTemplate | null {
  return (
    TUTOR_CATALOG.find((template) => template.archetypeId === archetypeId) ?? null
  );
}

export function isCatalogIdentity(
  archetypeId: string,
  templateVersion: string,
): boolean {
  const template = getTutorCatalogTemplate(archetypeId);
  return template?.templateVersion === templateVersion;
}

export type CatalogDesignValidation =
  | { valid: true; template: TutorCatalogTemplate }
  | { valid: false; reason: "unknown_catalog_identity" | "unsupported_policy_combination" };

export function validateCatalogDesign(
  design: Pick<
    TutorDesign,
    | "archetypeId"
    | "templateVersion"
    | "controls"
    | "permittedAssistanceStates"
    | "permittedTeachingMoves"
  >,
): CatalogDesignValidation {
  const template = getTutorCatalogTemplate(design.archetypeId);
  if (!template || template.templateVersion !== design.templateVersion) {
    return { valid: false, reason: "unknown_catalog_identity" };
  }

  const hasOnlySupportedStates = design.permittedAssistanceStates.every((state) =>
    template.permittedAssistanceStates.includes(state),
  );
  const hasOnlySupportedMoves = design.permittedTeachingMoves.every((move) =>
    template.permittedTeachingMoves.includes(move),
  );
  const protectsAnswers =
    design.controls.answerPolicy !== "available_in_revision_mode" ||
    design.permittedAssistanceStates.includes("complete");

  if (!hasOnlySupportedStates || !hasOnlySupportedMoves || !protectsAnswers) {
    return { valid: false, reason: "unsupported_policy_combination" };
  }

  return { valid: true, template };
}

export function relevantTeacherConfirmedEvidence(
  courseModel: Pick<CourseModel, "pedagogicalEvidence">,
  archetypeId: string,
): PedagogicalObservation[] {
  const template = getTutorCatalogTemplate(archetypeId);
  if (!template) return [];

  return courseModel.pedagogicalEvidence.filter(
    (observation) =>
      observation.status === "teacher_confirmed" &&
      template.relevantObservations.includes(observation.observation),
  );
}
