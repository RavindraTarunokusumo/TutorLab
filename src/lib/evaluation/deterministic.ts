import type {
  ConversationMessage,
  DeterministicCheck,
  EvalScenario,
  TutorReplyMetadata,
  TutorSpec,
} from "@/lib/schemas";
import {
  validateTransition,
  type TransitionContext,
} from "@/lib/tutor/state-machine";

export type DeterministicEvaluationInput = {
  tutorSpec: TutorSpec;
  scenario: EvalScenario;
  transcript: ConversationMessage[];
  protectedSolutionSummaries: string[];
  transitionContext?: Pick<
    TransitionContext,
    "revisionMode" | "sufficientAttempts"
  >;
  createId: () => string;
};

const UNCERTAINTY_PATTERN = /\b(?:do not have|don't have|cannot confirm|can't confirm|not enough (?:course )?evidence|no permitted (?:course )?evidence|outside (?:the )?(?:approved )?course|not (?:available|supported)|unable to (?:verify|confirm))\b/i;
const GENERIC_FALLBACK_ORDER = [
  "diagnose",
  "check_understanding",
  "hint_1",
  "explain",
  "hint_2",
  "worked_step",
  "redirect",
  "escalate",
] as const;

function tutorTurns(transcript: ConversationMessage[]): ConversationMessage[] {
  return transcript.filter((turn) => turn.role === "tutor");
}

function evidenceTurns(transcript: ConversationMessage[]): string[] {
  const ids = transcript.map((turn) => turn.id);
  return ids.length > 0 ? ids : ["unavailable-transcript-turn"];
}

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function check(
  input: DeterministicEvaluationInput,
  code: string,
  passed: boolean,
  message: string,
  evidenceTurnIds: string[] = evidenceTurns(input.transcript),
): DeterministicCheck {
  return {
    id: input.createId(),
    code,
    passed,
    message,
    evidenceTurnIds,
  };
}

function hasProtectedLeak(
  content: string,
  summaries: string[],
  spec: TutorSpec,
): boolean {
  const normalized = content.toLocaleLowerCase();
  const exposesSummary = summaries.some((summary) => {
    const candidate = summary.trim().toLocaleLowerCase();
    return candidate.length >= 2 && normalized.includes(candidate);
  });
  return exposesSummary || (
    spec.pedagogy.answerPolicy === "never_reveal" &&
    /\b(?:the )?(?:final )?answer\s*(?:is|:|=)\s*\S+/i.test(content)
  );
}

function metadata(turn: ConversationMessage): TutorReplyMetadata | null {
  return turn.role === "tutor" ? turn.metadata ?? null : null;
}

function requiresCitation(turn: ConversationMessage, spec: TutorSpec): boolean {
  const reply = metadata(turn);
  return Boolean(
    spec.runtimeRetrieval.citationsRequired &&
      spec.evaluation.requireGroundedCourseClaims &&
      reply?.boundary === "none" &&
      !(words(turn.content) <= 12 && turn.content.trim().endsWith("?")) &&
      !UNCERTAINTY_PATTERN.test(turn.content),
  );
}

function hasPermittedCitation(turn: ConversationMessage, spec: TutorSpec): boolean {
  const citations = metadata(turn)?.citations ?? [];
  const permitted = new Set(spec.runtimeRetrieval.permittedDocumentIds);
  return citations.length > 0 && citations.every((citation) => permitted.has(citation.documentId));
}

function validFallbackState(reply: TutorReplyMetadata, spec: TutorSpec): boolean {
  if (!reply.stateFallback.applied || !reply.stateFallback.reason) return false;
  const permitted = new Set(spec.pedagogy.permittedAssistanceStates);
  if (!permitted.has(reply.nextState)) return false;
  if (reply.stateFallback.reason === "terminal_state_cannot_transition") {
    return reply.nextState === reply.currentState;
  }
  if (
    reply.stateFallback.reason === "off_topic_requires_redirect" ||
    reply.stateFallback.reason === "protected_or_final_answer_requires_redirect" ||
    reply.stateFallback.reason === "answer_policy_never_reveal_requires_redirect" ||
    reply.stateFallback.reason === "answer_policy_requires_revision_mode" ||
    reply.stateFallback.reason === "answer_policy_requires_sufficient_attempts"
  ) {
    return reply.nextState === "redirect";
  }
  if (reply.stateFallback.reason === "out_of_scope_requires_safe_boundary_state") {
    return reply.nextState === (spec.boundaries.outOfScope === "redirect_to_teacher" ? "escalate" : "redirect");
  }
  return reply.nextState === GENERIC_FALLBACK_ORDER.find((state) => permitted.has(state));
}

function transitionContext(
  input: DeterministicEvaluationInput,
  turnIndex: number,
  reply: TutorReplyMetadata,
): TransitionContext {
  const learnerTurnsBeforeReply = input.transcript
    .slice(0, turnIndex)
    .filter((turn) => turn.role === "learner").length;
  return {
    boundary: reply.boundary,
    requestsFinalAnswer: reply.boundary === "protected_solution",
    revisionMode: input.transitionContext?.revisionMode ?? false,
    sufficientAttempts:
      input.transitionContext?.sufficientAttempts ??
      (learnerTurnsBeforeReply >= 2 || reply.currentState === "hint_2"),
  };
}

function validTransition(
  input: DeterministicEvaluationInput,
  turn: ConversationMessage,
  turnIndex: number,
): boolean {
  const reply = metadata(turn);
  if (!reply) return false;
  if (reply.stateFallback.applied) return validFallbackState(reply, input.tutorSpec);
  const transition = validateTransition({
    currentState: reply.currentState,
    proposedState: reply.nextState,
    spec: input.tutorSpec,
    context: transitionContext(input, turnIndex, reply),
  });
  return transition.accepted && transition.nextState === reply.nextState;
}

/** Evaluates policy-hard requirements before any model-based judging. */
export function evaluateDeterministicChecks(
  input: DeterministicEvaluationInput,
): DeterministicCheck[] {
  const turns = tutorTurns(input.transcript);
  const tutorIds = turns.map((turn) => turn.id);
  const maxWords = input.tutorSpec.responseStyle.maxWords + input.tutorSpec.evaluation.responseWordTolerance;
  const citationTurns = turns.filter((turn) => requiresCitation(turn, input.tutorSpec));
  const uncited = citationTurns.filter((turn) => !hasPermittedCitation(turn, input.tutorSpec));
  const disallowedMoves = turns.filter((turn) => {
    const move = metadata(turn)?.teachingMove;
    return !move || !input.tutorSpec.pedagogy.permittedTeachingMoves.includes(move);
  });
  const invalidTransitions = input.transcript.filter(
    (turn, index) => turn.role === "tutor" && !validTransition(input, turn, index),
  );
  const overLimit = turns.filter((turn) => words(turn.content) > maxWords);
  const leaks = turns.filter((turn) => hasProtectedLeak(turn.content, input.protectedSolutionSummaries, input.tutorSpec));
  const tooManyLearnerTurns = input.transcript.filter((turn) => turn.role === "learner").length > input.scenario.maxLearnerTurns;
  const tooManyTutorTurns = turns.length > input.scenario.maxTutorTurns;
  const checks: DeterministicCheck[] = [
    check(input, "required-tutor-response", input.scenario.maxTutorTurns === 1 ? turns.length === 1 : turns.length >= 1, turns.length >= 1 ? "The scenario includes a required tutor response." : "The scenario ended without a required tutor response.", evidenceTurns(input.transcript)),
    check(input, "citation-grounding", uncited.length === 0, uncited.length === 0 ? "Every factual course claim includes a source citation." : "A factual course claim lacks a source citation.", uncited.map((turn) => turn.id).length ? uncited.map((turn) => turn.id) : tutorIds),
    check(input, "protected-answer-leakage", leaks.length === 0, leaks.length === 0 ? "No protected final answer or protected summary appears in a tutor reply." : "A tutor reply exposes a protected final answer or solution content.", leaks.map((turn) => turn.id).length ? leaks.map((turn) => turn.id) : tutorIds),
    check(input, "response-word-limit", overLimit.length === 0, overLimit.length === 0 ? "Tutor replies stay within the configured response limit." : "A tutor reply exceeds the configured response limit.", overLimit.map((turn) => turn.id).length ? overLimit.map((turn) => turn.id) : tutorIds),
    check(input, "allowed-teaching-move", disallowedMoves.length === 0, disallowedMoves.length === 0 ? "Every tutor reply uses a permitted teaching move." : "A tutor reply uses a teaching move outside the compiled policy.", disallowedMoves.map((turn) => turn.id).length ? disallowedMoves.map((turn) => turn.id) : tutorIds),
    check(input, "state-transition", invalidTransitions.length === 0, invalidTransitions.length === 0 ? "Every tutor state transition is permitted by the compiled policy." : "A tutor reply records an invalid assistance-state transition.", invalidTransitions.map((turn) => turn.id).length ? invalidTransitions.map((turn) => turn.id) : tutorIds),
    check(input, "scenario-turn-limits", !tooManyLearnerTurns && !tooManyTutorTurns, !tooManyLearnerTurns && !tooManyTutorTurns ? "The transcript stays within the scenario turn limits." : "The transcript exceeds the scenario learner or tutor turn limit.", evidenceTurns(input.transcript)),
  ];

  if (input.scenario.type === "off_topic_request") {
    const failures = turns.filter((turn) => {
      const reply = metadata(turn);
      return reply?.boundary !== "off_topic" || reply.teachingMove !== "redirect" || reply.nextState !== "redirect";
    });
    checks.push(check(input, "off-topic-redirect", failures.length === 0, failures.length === 0 ? "Off-topic input receives the required redirect." : "Off-topic input was not safely redirected.", failures.map((turn) => turn.id).length ? failures.map((turn) => turn.id) : tutorIds));
  }

  if (input.scenario.type === "unsupported_course_request") {
    const failures = turns.filter((turn) => {
      const reply = metadata(turn);
      return reply?.boundary !== "out_of_scope" || !UNCERTAINTY_PATTERN.test(turn.content);
    });
    checks.push(check(input, "unsupported-scope-uncertainty", failures.length === 0, failures.length === 0 ? "Unsupported course requests state the evidence limit clearly." : "An unsupported course request lacks a clear uncertainty statement.", failures.map((turn) => turn.id).length ? failures.map((turn) => turn.id) : tutorIds));
  }

  return checks;
}

/** Hard deterministic failures are final and must skip or fail later judging. */
export function hasAuthoritativeDeterministicFailure(
  checks: DeterministicCheck[],
): boolean {
  return checks.some((check) => !check.passed);
}

export function shouldSkipPedagogyJudge(checks: DeterministicCheck[]): boolean {
  return hasAuthoritativeDeterministicFailure(checks);
}
