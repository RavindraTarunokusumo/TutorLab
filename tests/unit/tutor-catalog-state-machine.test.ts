import { describe, expect, it } from "vitest";
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
import type { CourseModel, TutorDesign, TutorSpec } from "@/lib/schemas";

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
      answerPolicy: "never_reveal",
      permittedAssistanceStates: [
        "diagnose",
        "hint_1",
        "hint_2",
        "worked_step",
        "explain",
        "check_understanding",
        "complete",
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
    courseManifest: [{ documentId: "document-probability", title: "Probability notes" }],
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
  it("accepts every edge from the SPEC state graph", () => {
    const tutorSpec = spec({ answerPolicy: "available_in_revision_mode" });
    const edges: Array<[Parameters<typeof validateTransition>[0]["currentState"], Parameters<typeof validateTransition>[0]["proposedState"], TransitionContext?]> = [
      ["diagnose", "hint_1"],
      ["diagnose", "explain"],
      ["hint_1", "hint_2"],
      ["hint_2", "worked_step"],
      ["worked_step", "check_understanding"],
      ["explain", "check_understanding"],
      ["check_understanding", "diagnose"],
      ["check_understanding", "complete", { revisionMode: true }],
    ];

    for (const [currentState, proposedState, context] of edges) {
      expect(isSpecTransition(currentState, proposedState)).toBe(true);
      expect(validateTransition({ currentState, proposedState, spec: tutorSpec, context }).accepted).toBe(true);
    }
  });

  it("uses a recorded strict fallback for forbidden transitions and disallowed policy states", () => {
    const graphFailure = validateTransition({
      currentState: "diagnose",
      proposedState: "worked_step",
      spec: spec(),
    });
    expect(graphFailure).toMatchObject({
      accepted: false,
      nextState: "diagnose",
      stateFallback: { applied: true, reason: "transition_not_in_spec_graph" },
    });

    const policyFailure = validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: spec({ permittedAssistanceStates: ["diagnose", "hint_1", "redirect"] }),
    });
    expect(policyFailure).toMatchObject({
      accepted: false,
      nextState: "diagnose",
      stateFallback: { reason: "proposed_state_not_permitted_by_tutor_policy" },
    });
  });

  it("rejects every outgoing edge from terminal states", () => {
    const allStates = [
      "diagnose",
      "hint_1",
      "hint_2",
      "worked_step",
      "explain",
      "check_understanding",
      "complete",
      "redirect",
      "escalate",
    ] as const;

    const contexts: TransitionContext[] = [
      {},
      { boundary: "off_topic" },
      { boundary: "out_of_scope" },
      { requestsFinalAnswer: true },
      { wouldRevealFinalAnswer: true, revisionMode: true },
      { boundary: "protected_solution", requestsFinalAnswer: true },
    ];

    for (const currentState of ["complete", "redirect", "escalate"] as const) {
      for (const proposedState of allStates) {
        for (const context of contexts) {
          const transition = validateTransition({ currentState, proposedState, spec: spec(), context });
          expect(transition).toMatchObject({
            accepted: false,
            stateFallback: { applied: true, reason: "terminal_state_cannot_transition" },
          });
          expect(transition.nextState).toBe(currentState);
        }
      }
    }
  });

  it("rejects every non-graph edge from non-terminal states with a safe fallback", () => {
    const allStates = [
      "diagnose",
      "hint_1",
      "hint_2",
      "worked_step",
      "explain",
      "check_understanding",
      "complete",
      "redirect",
      "escalate",
    ] as const;
    const nonTerminalStates = [
      "diagnose",
      "hint_1",
      "hint_2",
      "worked_step",
      "explain",
      "check_understanding",
    ] as const;

    for (const currentState of nonTerminalStates) {
      for (const proposedState of allStates) {
        if (isSpecTransition(currentState, proposedState)) continue;

        const transition = validateTransition({ currentState, proposedState, spec: spec() });
        expect(transition).toMatchObject({ accepted: false, stateFallback: { applied: true } });
        expect(transition.nextState).not.toBe("complete");
      }
    }

    expect(validateTransition({
      currentState: "check_understanding",
      proposedState: "complete",
      spec: spec({ answerPolicy: "available_in_revision_mode" }),
      context: { revisionMode: true },
    })).toMatchObject({ accepted: true, nextState: "complete" });
  });

  it("protects final answers and routes boundary requests through safe states", () => {
    const tutorSpec = spec();
    const protectedAnswer = validateTransition({
      currentState: "hint_2",
      proposedState: "worked_step",
      spec: tutorSpec,
      context: { boundary: "protected_solution", requestsFinalAnswer: true },
    });
    expect(protectedAnswer).toMatchObject({
      accepted: false,
      nextState: "redirect",
      stateFallback: { reason: "protected_or_final_answer_requires_redirect" },
    });

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "redirect",
      spec: tutorSpec,
      context: { boundary: "off_topic" },
    }).accepted).toBe(true);

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: tutorSpec,
      context: { boundary: "out_of_scope" },
    })).toMatchObject({ nextState: "redirect", accepted: false });
  });

  it("fails safe rather than completing when a boundary policy has no redirect or escalation state", () => {
    const unsafeSpec = spec({ permittedAssistanceStates: ["complete"] });
    const transition = validateTransition({
      currentState: "diagnose",
      proposedState: "complete",
      spec: unsafeSpec,
      context: { boundary: "protected_solution" },
    });

    expect(transition).toMatchObject({
      accepted: false,
      nextState: null,
      stateFallback: {
        applied: true,
        reason: "protected_or_final_answer_requires_redirect",
      },
    });
  });

  it("redirects or escalates teacher-only scope boundaries without using a normal teaching state", () => {
    const tutorSpec = spec();
    tutorSpec.boundaries.outOfScope = "redirect_to_teacher";

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "escalate",
      spec: tutorSpec,
      context: { boundary: "out_of_scope" },
    })).toMatchObject({ accepted: true, nextState: "escalate" });

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: tutorSpec,
      context: { boundary: "out_of_scope" },
    })).toMatchObject({ accepted: false, nextState: "escalate" });

    const noEscalationSpec = spec({
      permittedAssistanceStates: ["diagnose", "redirect"],
    });
    noEscalationSpec.boundaries.outOfScope = "redirect_to_teacher";

    expect(validateTransition({
      currentState: "diagnose",
      proposedState: "explain",
      spec: noEscalationSpec,
      context: { boundary: "out_of_scope" },
    })).toMatchObject({ accepted: false, nextState: null });
  });

  it("allows completion only in revision mode with the revision answer policy", () => {
    const policyFailure = validateTransition({
      currentState: "check_understanding",
      proposedState: "complete",
      spec: spec(),
      context: { revisionMode: true },
    });
    expect(policyFailure.stateFallback.reason).toBe("completion_requires_revision_mode_answer_policy");

    const modeFailure = validateTransition({
      currentState: "check_understanding",
      proposedState: "complete",
      spec: spec({ answerPolicy: "available_in_revision_mode" }),
    });
    expect(modeFailure.stateFallback.reason).toBe("completion_requires_revision_mode");

    expect(validateTransition({
      currentState: "check_understanding",
      proposedState: "complete",
      spec: spec({ answerPolicy: "available_in_revision_mode" }),
      context: { revisionMode: true, wouldRevealFinalAnswer: true },
    })).toMatchObject({ accepted: true, nextState: "complete" });
  });

  it("requires explicit sufficient attempts before reveal-after-attempts support", () => {
    const tutorSpec = spec({ answerPolicy: "reveal_after_sufficient_attempts" });

    expect(validateTransition({
      currentState: "hint_2",
      proposedState: "worked_step",
      spec: tutorSpec,
      context: { wouldRevealFinalAnswer: true },
    })).toMatchObject({
      accepted: false,
      nextState: "redirect",
      stateFallback: { reason: "answer_policy_requires_sufficient_attempts" },
    });

    expect(validateTransition({
      currentState: "hint_2",
      proposedState: "worked_step",
      spec: tutorSpec,
      context: { wouldRevealFinalAnswer: true, sufficientAttempts: true },
    })).toMatchObject({ accepted: true, nextState: "worked_step" });
  });

  it("never permits an answer-revealing response under the never-reveal policy", () => {
    expect(validateTransition({
      currentState: "check_understanding",
      proposedState: "complete",
      spec: spec(),
      context: { wouldRevealFinalAnswer: true, revisionMode: true },
    })).toMatchObject({
      accepted: false,
      nextState: "redirect",
      stateFallback: { reason: "answer_policy_never_reveal_requires_redirect" },
    });
  });

  it("makes every catalog default state executable only through its approved graph path", () => {
    const sourceFor = {
      diagnose: "check_understanding",
      hint_1: "diagnose",
      hint_2: "hint_1",
      worked_step: "hint_2",
      explain: "diagnose",
      check_understanding: "explain",
      complete: "check_understanding",
      redirect: "diagnose",
      escalate: "diagnose",
    } as const;

    for (const template of listTutorCatalog()) {
      expect(template.permittedAssistanceStates.includes("complete")).toBe(
        template.defaultControls.answerPolicy === "available_in_revision_mode",
      );

      for (const proposedState of template.permittedAssistanceStates) {
        const tutorSpec = spec({
          answerPolicy: template.defaultControls.answerPolicy,
          permittedAssistanceStates: [...template.permittedAssistanceStates],
          permittedTeachingMoves: [...template.permittedTeachingMoves],
        });
        const context: TransitionContext = {};
        if (proposedState === "worked_step" && tutorSpec.pedagogy.answerPolicy === "reveal_after_sufficient_attempts") {
          context.sufficientAttempts = true;
        }
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
        const transition = validateTransition({
          currentState,
          proposedState,
          spec: tutorSpec,
          context,
        });
        expect(transition).toMatchObject({ accepted: true, nextState: proposedState });
      }
    }
  });
});
