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
  archetypeId: "socratic" | "guided-practice" | "inquiry-case-based" | "explicit-instruction" | "retrieval-practice" | "worked-example-fading" | "metacognitive-reflection" | "mastery-checkpoint";
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
  requiresDiagnosis: boolean;
  rank: number;
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
  requiresDiagnosis: true,
  rank: 1,
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
  requiresDiagnosis: true,
  rank: 2,
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
  requiresDiagnosis: false,
  rank: 3,
};

function directTemplate(input: Pick<TutorCatalogTemplate, "archetypeId" | "title" | "strategySummary" | "tradeOff" | "defaultControls" | "relevantObservations" | "requiresDiagnosis" | "rank">): TutorCatalogTemplate {
  return {
    ...input,
    templateVersion: TUTOR_CATALOG_TEMPLATE_VERSION,
    permittedAssistanceStates: ["diagnose", "hint_1", "hint_2", "worked_step", "explain", "check_understanding", "redirect", "escalate"],
    permittedTeachingMoves: ["elicit_reasoning", "give_conceptual_hint", "give_procedural_hint", "model_worked_step", "explain_concept", "check_understanding", "summarize_learning", "redirect", "escalate"],
    defaultConstraints: ["Keep assistance grounded in the approved course model.", "Never disclose protected final answers."],
    evaluationExpectations: ["The tutor follows the selected teaching sequence and checks learner progress.", "Unsupported requests are bounded or redirected."],
  };
}

const ADDITIONAL_TEMPLATES: readonly TutorCatalogTemplate[] = [
  directTemplate({ archetypeId: "explicit-instruction", title: "Explicit Instruction Tutor", strategySummary: "Models a concise method, guides practice, and checks understanding before independent application.", tradeOff: "It gives learners less discovery time than inquiry-led approaches.", defaultControls: { diagnoseBeforeExplain: false, hintEscalation: "direct", tone: "neutral", maxWords: 180, offTopicHandling: "redirect" }, relevantObservations: ["consistent_solution_sequence", "formal_notation_required", "method_marks_emphasized"], requiresDiagnosis: false, rank: 4 }),
  directTemplate({ archetypeId: "retrieval-practice", title: "Retrieval Practice Coach", strategySummary: "Uses short recall prompts and spaced revisiting to strengthen durable access to course knowledge.", tradeOff: "It is less suited to first exposure to a difficult procedure.", defaultControls: { diagnoseBeforeExplain: false, hintEscalation: "balanced", tone: "encouraging", maxWords: 120, offTopicHandling: "brief_redirect" }, relevantObservations: ["conceptual_justification_required", "formal_notation_required"], requiresDiagnosis: false, rank: 5 }),
  directTemplate({ archetypeId: "worked-example-fading", title: "Worked-Example Fading Coach", strategySummary: "Starts from modeled examples and progressively removes steps as learner competence grows.", tradeOff: "It depends on strong source-grounded examples and can be too structured for open inquiry.", defaultControls: { diagnoseBeforeExplain: false, hintEscalation: "balanced", tone: "encouraging", maxWords: 200, offTopicHandling: "redirect" }, relevantObservations: ["worked_examples_frequently_used", "consistent_solution_sequence", "method_marks_emphasized"], requiresDiagnosis: false, rank: 6 }),
  directTemplate({ archetypeId: "metacognitive-reflection", title: "Metacognitive Reflection Coach", strategySummary: "Prompts learners to plan, monitor, explain, and evaluate their own approach.", tradeOff: "Reflection adds turns and is less efficient for rapid factual review.", defaultControls: { diagnoseBeforeExplain: true, hintEscalation: "gradual", tone: "encouraging", maxWords: 150, offTopicHandling: "brief_redirect" }, relevantObservations: ["reasoning_before_calculation", "conceptual_justification_required", "common_misconception"], requiresDiagnosis: true, rank: 7 }),
  directTemplate({ archetypeId: "mastery-checkpoint", title: "Mastery Checkpoint Tutor", strategySummary: "Uses focused checks and corrective feedback before advancing to the next objective.", tradeOff: "Frequent checkpoints can interrupt exploratory learning.", defaultControls: { diagnoseBeforeExplain: false, hintEscalation: "direct", tone: "neutral", maxWords: 140, offTopicHandling: "decline" }, relevantObservations: ["assessment_answer_sensitive", "method_marks_emphasized", "common_misconception"], requiresDiagnosis: false, rank: 8 }),
];

export const TUTOR_CATALOG: readonly TutorCatalogTemplate[] = [
  SOCrATIC_TEMPLATE,
  GUIDED_PRACTICE_TEMPLATE,
  INQUIRY_CASE_BASED_TEMPLATE,
  ...ADDITIONAL_TEMPLATES,
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
  if (!hasOnlySupportedStates || !hasOnlySupportedMoves) {
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
