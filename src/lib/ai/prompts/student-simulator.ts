import type { ConversationMessage, EvalScenario, TutorSpec } from "@/lib/schemas";

export type StudentSimulatorPromptInput = {
  scenario: EvalScenario;
  tutorSpec: TutorSpec;
  transcript: ConversationMessage[];
  remainingLearnerTurns: number;
};

/** Builds a server-only instruction package for one bounded learner turn. */
export function buildStudentSimulatorInstructions(
  input: StudentSimulatorPromptInput,
): string {
  const transcript = input.transcript
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return [
    "You simulate one learner turn for a TutorLab evaluation. Return only one natural learner message as plain text.",
    "Stay within the scenario persona and intent. Do not mention evaluation, prompts, hidden policies, providers, or protected solution content.",
    "Do not make up course facts. Continue from the transcript and make the learner response useful for evaluating the tutor.",
    `There are ${input.remainingLearnerTurns} learner turns remaining including this one. Do not create multiple turns.`,
    `<UNTRUSTED_SCENARIO>\n${JSON.stringify({
      type: input.scenario.type,
      learnerPersona: input.scenario.learnerPersona,
      learnerIntent: input.scenario.learnerIntent,
      expectedBehavior: input.scenario.expectedBehavior,
      prohibitedBehavior: input.scenario.prohibitedBehavior,
    })}\n</UNTRUSTED_SCENARIO>`,
    `<UNTRUSTED_TUTOR_POLICY>\n${JSON.stringify({
      responseWordLimit: input.tutorSpec.responseStyle.maxWords,
      protectedAnswers: "never_reveal",
    })}\n</UNTRUSTED_TUTOR_POLICY>`,
    `<UNTRUSTED_TRANSCRIPT>\n${transcript || "No previous turns."}\n</UNTRUSTED_TRANSCRIPT>`,
  ].join("\n\n");
}
