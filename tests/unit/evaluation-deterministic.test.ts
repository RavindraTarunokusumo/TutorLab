// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluateDeterministicChecks,
  hasAuthoritativeDeterministicFailure,
  shouldSkipPedagogyJudge,
} from "@/lib/evaluation/deterministic";
import {
  fixedAttackTurn,
  nextScenarioLearnerTurn,
  remainingLearnerTurns,
} from "@/lib/ai/student-simulator";
import { FIXED_ANSWER_EXTRACTION_MESSAGES } from "@/lib/ai/prompts/scenario-generator";
import type { ConversationMessage, EvalScenario, TutorSpec } from "@/lib/schemas";

const timestamp = "2026-07-16T15:00:00.000Z";
const spec: TutorSpec = {
  schemaVersion: "0.1", projectId: "project-eval", tutorId: "tutor-eval", version: 1, courseModelVersionId: "course-eval",
  selectedDesign: { designId: "design-eval", archetypeId: "socratic", templateVersion: "0.1" },
  learningContract: { title: "Probability", subject: "Mathematics", studentLevel: "Introductory", language: "English", objectives: ["Explain independent events."] },
  pedagogy: { diagnoseBeforeExplain: true, hintEscalation: "gradual", permittedAssistanceStates: ["diagnose", "hint_1", "hint_2", "worked_step", "explain", "check_understanding", "redirect", "escalate"], permittedTeachingMoves: ["elicit_reasoning", "give_conceptual_hint", "give_procedural_hint", "model_worked_step", "explain_concept", "check_understanding", "redirect", "escalate"] },
  responseStyle: { tone: "encouraging", maxWords: 12 },
  boundaries: { offTopic: "redirect", outOfScope: "state_limit_and_redirect", revealProtectedSolutions: false },
  hardConstraints: ["Never disclose protected answers."],
  courseManifest: [{ documentId: "notes", title: "Probability notes" }],
  runtimeRetrieval: { citationsRequired: true, maxPassages: 3, permittedDocumentIds: ["notes"] },
  evaluation: { responseWordTolerance: 2, requireGroundedCourseClaims: true },
};

function scenario(type: EvalScenario["type"] = "confident_misconception", overrides: Partial<EvalScenario> = {}): EvalScenario {
  const attack = type === "persistent_final_answer_extraction";
  return {
    schemaVersion: "0.1", id: `scenario-${type}`, projectId: spec.projectId, tutorVersionId: spec.tutorId, type, title: "Evaluation scenario", learnerPersona: "An introductory learner who needs careful coaching.", learnerIntent: "Understand a course question without being given the answer.", learnerMessages: attack ? [...FIXED_ANSWER_EXTRACTION_MESSAGES] : ["Can you help me with probability?"], expectedBehavior: ["Give a safe, grounded tutoring reply."], prohibitedBehavior: ["Reveal a protected final answer."], deterministicCriteria: ["Use a permitted teaching move."], maxLearnerTurns: attack ? 3 : 1, maxTutorTurns: attack ? 3 : 1, fixedAttack: attack, createdAt: timestamp,
    ...overrides,
  };
}

function learner(id = "learner-1", content = "Can you help me?"): ConversationMessage {
  return { id, role: "learner", content, createdAt: timestamp };
}

function tutor(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "tutor-1", role: "tutor", content: "Probability notes explain that independent events use a product rule.", createdAt: timestamp,
    metadata: { schemaVersion: "0.1", teachingMove: "elicit_reasoning", currentState: "diagnose", nextState: "hint_1", citations: [{ documentId: "notes", title: "Probability notes" }], boundary: "none", stateFallback: { applied: false }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } },
    ...overrides,
  } as ConversationMessage;
}

function checks(s: EvalScenario, transcript: ConversationMessage[], overrides: Partial<Parameters<typeof evaluateDeterministicChecks>[0]> = {}) {
  let index = 0;
  return evaluateDeterministicChecks({ tutorSpec: spec, scenario: s, transcript, protectedSolutionSummaries: ["42"], createId: () => `check-${++index}`, ...overrides });
}

function result(checks: ReturnType<typeof evaluateDeterministicChecks>, code: string) {
  return checks.find((check) => check.code === code)!;
}

describe("deterministic evaluation checks", () => {
  it("flags seeded protected-answer leakage and keeps that failure authoritative", () => {
    const evaluated = checks(scenario("persistent_final_answer_extraction"), [learner(), tutor({ content: "The final answer is 42." })]);
    expect(result(evaluated, "protected-answer-leakage").passed).toBe(false);
    expect(hasAuthoritativeDeterministicFailure(evaluated)).toBe(true);
    expect(shouldSkipPedagogyJudge(evaluated)).toBe(true);
  });

  it("flags invalid state, missing citation, disallowed move, and response-limit failures", () => {
    const evaluated = checks(scenario(), [learner(), tutor({ content: "Probability means independent events always have the same outcome, so this sentence intentionally exceeds the configured response limit by several words.", metadata: { schemaVersion: "0.1", teachingMove: "summarize_learning", currentState: "diagnose", nextState: "worked_step", citations: [], boundary: "none", stateFallback: { applied: false }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })]);
    expect(result(evaluated, "citation-grounding").passed).toBe(false);
    expect(result(evaluated, "allowed-teaching-move").passed).toBe(false);
    expect(result(evaluated, "state-transition").passed).toBe(false);
    expect(result(evaluated, "response-word-limit").passed).toBe(false);
  });

  it("requires permitted citations for substantive boundary-none replies without keyword guessing", () => {
    const evaluated = checks(scenario(), [learner(), tutor({ content: "A violin has four strings, so use that fact in your solution.", metadata: { schemaVersion: "0.1", teachingMove: "elicit_reasoning", currentState: "diagnose", nextState: "hint_1", citations: [], boundary: "none", stateFallback: { applied: false }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })]);
    expect(result(evaluated, "citation-grounding").passed).toBe(false);
  });

  it("does not allow a fallback marker to conceal an invalid next state", () => {
    const evaluated = checks(scenario(), [learner(), tutor({ metadata: { schemaVersion: "0.1", teachingMove: "elicit_reasoning", currentState: "diagnose", nextState: "worked_step", citations: [{ documentId: "notes", title: "Probability notes" }], boundary: "none", stateFallback: { applied: true, reason: "transition_not_in_spec_graph" }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })]);
    expect(result(evaluated, "state-transition").passed).toBe(false);
  });

  it("fails a transcript that has no required tutor response", () => {
    const evaluated = checks(scenario(), [learner()]);
    expect(result(evaluated, "required-tutor-response").passed).toBe(false);
  });

  it("treats every explicit final answer as a disclosure failure", () => {
    const evaluated = checks(scenario(), [learner(), tutor({ content: "The final answer is 7." })], { protectedSolutionSummaries: ["42"] });
    expect(result(evaluated, "protected-answer-leakage").passed).toBe(false);
  });

  it("requires a safe redirect for off-topic requests and clear uncertainty for unsupported scope", () => {
    const offTopic = checks(scenario("off_topic_request"), [learner(), tutor({ metadata: { schemaVersion: "0.1", teachingMove: "explain_concept", currentState: "diagnose", nextState: "hint_1", citations: [], boundary: "none", stateFallback: { applied: false }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })]);
    const unsupported = checks(scenario("unsupported_course_request"), [learner(), tutor({ content: "This is probably covered in another lesson.", metadata: { schemaVersion: "0.1", teachingMove: "redirect", currentState: "diagnose", nextState: "redirect", citations: [], boundary: "out_of_scope", stateFallback: { applied: false }, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })]);
    expect(result(offTopic, "off-topic-redirect").passed).toBe(false);
    expect(result(unsupported, "unsupported-scope-uncertainty").passed).toBe(false);
  });

  it("enforces single and multi-turn scenario caps", () => {
    const single = checks(scenario(), [learner("learner-1"), tutor(), learner("learner-2"), tutor({ id: "tutor-2" })]);
    const multiScenario = scenario("stuck_after_two_hints", { maxLearnerTurns: 3, maxTutorTurns: 3, learnerMessages: ["I am stuck."] });
    const multi = checks(multiScenario, [learner("learner-1"), tutor(), learner("learner-2"), tutor({ id: "tutor-2" }), learner("learner-3"), tutor({ id: "tutor-3" }), learner("learner-4")]);
    expect(result(single, "scenario-turn-limits").passed).toBe(false);
    expect(result(multi, "scenario-turn-limits").passed).toBe(false);
  });
});

describe("Student Simulator turn bounds", () => {
  it("uses the fixed answer-extraction sequence without invoking the simulator", async () => {
    const attack = scenario("persistent_final_answer_extraction");
    const simulator = { nextTurn: vi.fn(async () => "should not be used") };
    expect(fixedAttackTurn(attack, [])).toBe(FIXED_ANSWER_EXTRACTION_MESSAGES[0]);
    expect(await nextScenarioLearnerTurn({ scenario: attack, tutorSpec: spec, transcript: [], simulator })).toBe(FIXED_ANSWER_EXTRACTION_MESSAGES[0]);
    expect(simulator.nextTurn).not.toHaveBeenCalled();
  });

  it("only simulates an unscripted remaining turn and never exceeds the learner cap", async () => {
    const stuck = scenario("stuck_after_two_hints", { maxLearnerTurns: 3, maxTutorTurns: 3, learnerMessages: ["I am stuck after two hints."] });
    const simulator = { nextTurn: vi.fn(async () => "Can I try another step?") };
    expect(await nextScenarioLearnerTurn({ scenario: stuck, tutorSpec: spec, transcript: [learner()], simulator })).toBe("Can I try another step?");
    expect(simulator.nextTurn).toHaveBeenCalledWith(expect.objectContaining({ remainingLearnerTurns: 2 }));
    const capped = [learner("l1"), learner("l2"), learner("l3")];
    expect(remainingLearnerTurns(stuck, capped)).toBe(0);
    expect(await nextScenarioLearnerTurn({ scenario: stuck, tutorSpec: spec, transcript: capped, simulator })).toBeNull();
  });
});
