import type { AssistanceState, TutorSpec } from "@/lib/schemas";

export type TransitionBoundary =
  | "none"
  | "off_topic"
  | "out_of_scope"
  | "protected_solution";

export type TransitionContext = {
  boundary?: TransitionBoundary;
  requestsFinalAnswer?: boolean;
  wouldRevealFinalAnswer?: boolean;
  revisionMode?: boolean;
  sufficientAttempts?: boolean;
};

export type StateTransition = {
  currentState: AssistanceState;
  proposedState: AssistanceState;
  nextState: AssistanceState | null;
  accepted: boolean;
  stateFallback: {
    applied: boolean;
    reason?: string;
  };
};

const SPEC_TRANSITIONS: Readonly<Record<AssistanceState, readonly AssistanceState[]>> = {
  diagnose: ["hint_1", "explain"],
  hint_1: ["hint_2"],
  hint_2: ["worked_step"],
  worked_step: ["check_understanding"],
  explain: ["check_understanding"],
  check_understanding: ["diagnose", "complete"],
  complete: [],
  redirect: [],
  escalate: [],
};

const GENERAL_FALLBACK_ORDER: readonly AssistanceState[] = [
  "diagnose",
  "check_understanding",
  "hint_1",
  "explain",
  "hint_2",
  "worked_step",
  "redirect",
  "escalate",
];

const BOUNDARY_FALLBACK_ORDER: readonly AssistanceState[] = [
  "redirect",
  "escalate",
];

function fallbackState(
  spec: TutorSpec,
  boundary: boolean,
  requiredBoundaryState?: AssistanceState,
): AssistanceState | null {
  const permitted = new Set(spec.pedagogy.permittedAssistanceStates);
  if (requiredBoundaryState) {
    return permitted.has(requiredBoundaryState) ? requiredBoundaryState : null;
  }
  const order = boundary ? BOUNDARY_FALLBACK_ORDER : GENERAL_FALLBACK_ORDER;
  const candidate = order.find((state) => permitted.has(state));

  // A boundary fallback may only redirect or escalate. Returning null marks a
  // fail-safe response when an invalid specification lacks either state.
  return candidate ?? null;
}

function reject(
  currentState: AssistanceState,
  proposedState: AssistanceState,
  spec: TutorSpec,
  reason: string,
  boundary = false,
  requiredBoundaryState?: AssistanceState,
): StateTransition {
  return {
    currentState,
    proposedState,
    nextState: fallbackState(spec, boundary, requiredBoundaryState),
    accepted: false,
    stateFallback: { applied: true, reason },
  };
}

export function isSpecTransition(
  currentState: AssistanceState,
  nextState: AssistanceState,
): boolean {
  return SPEC_TRANSITIONS[currentState].includes(nextState);
}

export function isTerminalState(state: AssistanceState): boolean {
  return state === "complete" || state === "redirect" || state === "escalate";
}

function rejectTerminalProposal(
  currentState: AssistanceState,
  proposedState: AssistanceState,
  spec: TutorSpec,
): StateTransition {
  const permitted = new Set(spec.pedagogy.permittedAssistanceStates);
  return {
    currentState,
    proposedState,
    nextState: permitted.has(currentState) ? currentState : null,
    accepted: false,
    stateFallback: { applied: true, reason: "terminal_state_cannot_transition" },
  };
}

export function validateTransition({
  currentState,
  proposedState,
  spec,
  context = {},
}: {
  currentState: AssistanceState;
  proposedState: AssistanceState;
  spec: TutorSpec;
  context?: TransitionContext;
}): StateTransition {
  const boundary = context.boundary ?? "none";
  const permitted = new Set(spec.pedagogy.permittedAssistanceStates);

  if (isTerminalState(currentState)) {
    return rejectTerminalProposal(currentState, proposedState, spec);
  }

  const protectedAnswerRequest = boundary === "protected_solution";

  if (boundary === "off_topic") {
    if (proposedState === "redirect" && permitted.has("redirect")) {
      return accepted(currentState, proposedState);
    }
    return reject(
      currentState,
      proposedState,
      spec,
      "off_topic_requires_redirect",
      true,
    );
  }

  if (boundary === "out_of_scope") {
    const requiredState =
      spec.boundaries.outOfScope === "redirect_to_teacher" ? "escalate" : "redirect";
    if (proposedState === requiredState && permitted.has(requiredState)) {
      return accepted(currentState, proposedState);
    }
    return reject(
      currentState,
      proposedState,
      spec,
      "out_of_scope_requires_safe_boundary_state",
      true,
      requiredState,
    );
  }

  if (protectedAnswerRequest) {
    if (proposedState === "redirect" && permitted.has("redirect")) {
      return accepted(currentState, proposedState);
    }
    return reject(
      currentState,
      proposedState,
      spec,
      "protected_or_final_answer_requires_redirect",
      true,
    );
  }

  const finalAnswerDisclosure =
    context.requestsFinalAnswer === true || context.wouldRevealFinalAnswer === true;
  if (finalAnswerDisclosure && spec.pedagogy.answerPolicy === "never_reveal") {
    return reject(
      currentState,
      proposedState,
      spec,
      "answer_policy_never_reveal_requires_redirect",
      true,
    );
  }

  if (
    finalAnswerDisclosure &&
    spec.pedagogy.answerPolicy === "available_in_revision_mode" &&
    context.revisionMode !== true
  ) {
    return reject(
      currentState,
      proposedState,
      spec,
      "answer_policy_requires_revision_mode",
      true,
    );
  }

  if (
    finalAnswerDisclosure &&
    spec.pedagogy.answerPolicy === "reveal_after_sufficient_attempts" &&
    context.sufficientAttempts !== true
  ) {
    return reject(
      currentState,
      proposedState,
      spec,
      "answer_policy_requires_sufficient_attempts",
      true,
    );
  }

  if (!permitted.has(currentState)) {
    return reject(
      currentState,
      proposedState,
      spec,
      "current_state_not_permitted_by_tutor_policy",
    );
  }

  if (!permitted.has(proposedState)) {
    return reject(
      currentState,
      proposedState,
      spec,
      "proposed_state_not_permitted_by_tutor_policy",
    );
  }

  if (!isSpecTransition(currentState, proposedState)) {
    return reject(
      currentState,
      proposedState,
      spec,
      "transition_not_in_spec_graph",
    );
  }

  if (proposedState === "complete" && context.revisionMode !== true) {
    return reject(
      currentState,
      proposedState,
      spec,
      "completion_requires_revision_mode",
    );
  }

  if (
    proposedState === "complete" &&
    spec.pedagogy.answerPolicy !== "available_in_revision_mode"
  ) {
    return reject(
      currentState,
      proposedState,
      spec,
      "completion_requires_revision_mode_answer_policy",
    );
  }

  if (
    proposedState === "worked_step" &&
    spec.pedagogy.answerPolicy === "reveal_after_sufficient_attempts" &&
    context.sufficientAttempts !== true
  ) {
    return reject(
      currentState,
      proposedState,
      spec,
      "worked_step_requires_sufficient_attempts",
    );
  }

  return accepted(currentState, proposedState);
}

function accepted(
  currentState: AssistanceState,
  proposedState: AssistanceState,
): StateTransition {
  return {
    currentState,
    proposedState,
    nextState: proposedState,
    accepted: true,
    stateFallback: { applied: false },
  };
}
