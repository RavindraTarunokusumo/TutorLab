import { describe, expect, it } from "vitest";
import type { CourseModel, TutorDesign, TutorSpec } from "@/lib/schemas";
import {
  getTutorCatalogTemplate,
  isCatalogIdentity,
  listTutorCatalog,
  relevantTeacherConfirmedEvidence,
  validateCatalogDesign,
} from "@/lib/tutor/catalog";
import {
  isSpecTransition,
  validateTransition,
  type TransitionContext,
} from "@/lib/tutor/state-machine";

function spec(overrides: Partial<TutorSpec["pedagogy"]> = {}): TutorSpec {
  return {
    schemaVersion: "0.1",
    projectId: "project-probability",
    tutorId: "tutor-probability",
    version: 1,
    courseModelVersionId: "course-model-version-1",
    selectedDesign: {
      designId: "design-socratic",
      archetypeId: "socratic",
      templateVersion: "0.1",
    },
    learningContract: {
      title: "Probability Guide",
      subject: "Probability",
      studentLevel: "Introductory",
      language: "English",
      objectives: ["Explain equally likely outcomes."],
    },
    pedagogy: {
      diagnoseBeforeExplain: true,
      hintEscalation: "gradual",
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
      ...overrides,
    },
    responseStyle: { tone: "encouraging", maxWords: 120 },
    boundaries: {
      offTopic: "redirect",
      outOfScope: "state_limit_and_redirect",
      revealProtectedSolutions: false,
    },
    hardConstraints: ["Never reveal protected final answers."],
    courseManifest: [
      { documentId: "document-probability", title: "Probability notes" },
    ],
    runtimeRetrieval: {
      citationsRequired: true,
      maxPassages: 3,
      permittedDocumentIds: ["document-probability"],
    },
    evaluation: { responseWordTolerance: 10, requireGroundedCourseClaims: true },
  };
}

function design(): Pick<
  TutorDesign,
  | "archetypeId"
  | "templateVersion"
  | "controls"
  | "permittedAssistanceStates"
  | "permittedTeachingMoves"
> {
  const template = getTutorCatalogTemplate("guided-practice")!;
  return {
    archetypeId: template.archetypeId,
    templateVersion: template.templateVersion,
    controls: { ...template.defaultControls },
    permittedAssistanceStates: [...template.permittedAssistanceStates],
    permittedTeachingMoves: [...template.permittedTeachingMoves],
  };
}

describe("Tutor catalog", () => {
  it("has finite, versioned, distinct archetypes", () => {
    const catalog = listTutorCatalog();

    expect(catalog.map(({ archetypeId }) => archetypeId)).toEqual([
      "socratic",
      "guided-practice",
      "inquiry-case-based",
      "explicit-instruction",
      "retrieval-practice",
      "worked-example-fading",
      "metacognitive-reflection",
      "mastery-checkpoint",
    ]);
    expect(new Set(catalog.map(({ title }) => title)).size).toBe(catalog.length);
    expect(new Set(catalog.map(({ strategySummary }) => strategySummary)).size).toBe(catalog.length);
    expect(catalog.every((template) => template.defaultConstraints.length > 0)).toBe(true);
    expect(catalog.every((template) => template.evaluationExpectations.length > 0)).toBe(true);
    expect(isCatalogIdentity("socratic", "0.1")).toBe(true);
    expect(isCatalogIdentity("socratic", "0.2")).toBe(false);
  });

  it("accepts only catalog-backed policy combinations", () => {
    const supported = design();
    expect(validateCatalogDesign(supported).valid).toBe(true);
    expect(validateCatalogDesign({ ...supported, archetypeId: "unknown" })).toMatchObject({
      valid: false,
      reason: "unknown_catalog_identity",
    });
    expect(validateCatalogDesign({
      ...supported,
      permittedTeachingMoves: [...supported.permittedTeachingMoves, "explain_concept"],
    })).toMatchObject({ valid: false, reason: "unsupported_policy_combination" });
  });

  it("returns only teacher-confirmed evidence relevant to a template", () => {
    const evidence = relevantTeacherConfirmedEvidence({
      pedagogicalEvidence: [
        { observation: "reasoning_before_calculation", status: "teacher_confirmed" },
        { observation: "common_misconception", status: "proposed" },
        { observation: "formal_notation_required", status: "teacher_confirmed" },
      ],
    } as CourseModel, "socratic");

    expect(evidence.map(({ observation }) => observation)).toEqual([
      "reasoning_before_calculation",
    ]);
  });
});

describe("Tutor assistance state machine", () => {
  const graphEdges = [
    ["diagnose", "hint_1"],
    ["diagnose", "explain"],
    ["hint_1", "hint_2"],
    ["hint_2", "worked_step"],
    ["worked_step", "check_understanding"],
    ["explain", "check_understanding"],
    ["check_understanding", "diagnose"],
  ] as const;

  it("accepts every edge from the runtime state graph", () => {
    for (const [currentState, proposedState] of graphEdges) {
      expect(isSpecTransition(currentState, proposedState)).toBe(true);
      expect(validateTransition({ currentState, proposedState, spec: spec() }).accepted).toBe(true);
    }
  });

  it("uses a recorded fallback for forbidden transitions and disallowed states", () => {
    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "worked_step",
      spec: spec(),
    })).toMatchObject({
      accepted: false,
      nextState: "diagnose",
      stateFallback: { applied: true, reason: "transition_not_in_spec_graph" },
    });

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: spec({ permittedAssistanceStates: ["diagnose", "hint_1", "redirect"] }),
    })).toMatchObject({
      accepted: false,
      nextState: "diagnose",
      stateFallback: { reason: "proposed_state_not_permitted_by_tutor_policy" },
    });
  });

  it("rejects every outgoing edge from terminal states", () => {
    const allStates = spec().pedagogy.permittedAssistanceStates;
    const contexts: TransitionContext[] = [
      {},
      { boundary: "off_topic" },
      { boundary: "out_of_scope" },
      { requestsFinalAnswer: true },
      { wouldRevealFinalAnswer: true },
      { boundary: "protected_solution", requestsFinalAnswer: true },
    ];

    for (const currentState of ["redirect", "escalate"] as const) {
      for (const proposedState of allStates) {
        for (const context of contexts) {
          expect(validateTransition({ currentState, proposedState, spec: spec(), context })).toMatchObject({
            accepted: false,
            nextState: currentState,
            stateFallback: { applied: true, reason: "terminal_state_cannot_transition" },
          });
        }
      }
    }
  });

  it("always redirects protected or final-answer disclosures", () => {
    for (const context of [
      { boundary: "protected_solution" as const },
      { requestsFinalAnswer: true },
      { wouldRevealFinalAnswer: true },
    ]) {
      expect(validateTransition({
        currentState: "hint_2",
        proposedState: "worked_step",
        spec: spec(),
        context,
      })).toMatchObject({
        accepted: false,
        nextState: "redirect",
        stateFallback: { reason: "protected_or_final_answer_requires_redirect" },
      });
    }
  });

  it("fails safe when a boundary policy has no redirect or escalation state", () => {
    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: spec({ permittedAssistanceStates: ["diagnose"] }),
      context: { boundary: "protected_solution" },
    })).toMatchObject({
      accepted: false,
      nextState: null,
      stateFallback: { reason: "protected_or_final_answer_requires_redirect" },
    });
  });

  it("makes every catalog state executable through its approved graph path", () => {
    const sourceFor = {
      diagnose: "check_understanding",
      hint_1: "diagnose",
      hint_2: "hint_1",
      worked_step: "hint_2",
      explain: "diagnose",
      check_understanding: "explain",
      redirect: "diagnose",
      escalate: "diagnose",
    } as const;

    for (const template of listTutorCatalog()) {
      for (const proposedState of template.permittedAssistanceStates) {
        const tutorSpec = spec({
          permittedAssistanceStates: [...template.permittedAssistanceStates],
          permittedTeachingMoves: [...template.permittedTeachingMoves],
        });
        const context: TransitionContext = {};
        if (proposedState === "redirect") context.boundary = "off_topic";
        if (proposedState === "escalate") {
          tutorSpec.boundaries.outOfScope = "redirect_to_teacher";
          context.boundary = "out_of_scope";
        }
        const currentState = proposedState === "check_understanding"
          ? template.permittedAssistanceStates.includes("explain")
            ? "explain"
            : "worked_step"
          : sourceFor[proposedState];

        expect(validateTransition({
          currentState,
          proposedState,
          spec: tutorSpec,
          context,
        })).toMatchObject({ accepted: true, nextState: proposedState });
      }
    }
  });
});
