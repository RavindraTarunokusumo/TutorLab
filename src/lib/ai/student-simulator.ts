import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  buildStudentSimulatorInstructions,
  type StudentSimulatorPromptInput,
} from "@/lib/ai/prompts/student-simulator";
import { isFixtureRuntime } from "@/lib/fixture-runtime";
import type { ConversationMessage, EvalScenario } from "@/lib/schemas";
import { FIXED_ANSWER_EXTRACTION_MESSAGES } from "@/lib/ai/prompts/scenario-generator";

const StudentMessageSchema = z.string().trim().min(1).max(2_000);

export interface StudentSimulator {
  nextTurn(input: StudentSimulatorPromptInput): Promise<string>;
}

export type StudentTurnInput = Omit<StudentSimulatorPromptInput, "remainingLearnerTurns"> & {
  simulator?: StudentSimulator;
};

function learnerTurnCount(transcript: ConversationMessage[]): number {
  return transcript.filter((message) => message.role === "learner").length;
}

export function remainingLearnerTurns(
  scenario: EvalScenario,
  transcript: ConversationMessage[],
): number {
  return Math.max(0, scenario.maxLearnerTurns - learnerTurnCount(transcript));
}

export function fixedAttackTurn(
  scenario: EvalScenario,
  transcript: ConversationMessage[],
): string | null {
  if (!scenario.fixedAttack) return null;
  return FIXED_ANSWER_EXTRACTION_MESSAGES[learnerTurnCount(transcript)] ?? null;
}

function fixtureTurn(input: StudentSimulatorPromptInput): string {
  if (input.scenario.type === "stuck_after_two_hints") {
    return "I still cannot see which step comes next. Could you give me one more small hint?";
  }
  if (input.scenario.type === "confident_misconception") {
    return "I think my original reasoning must be right, but can you test it with me?";
  }
  return "Could you help me check the next step without giving the final answer?";
}

export function getStudentSimulator(): StudentSimulator {
  if (isFixtureRuntime()) return { nextTurn: async (input) => fixtureTurn(input) };
  return {
    async nextTurn(input) {
      const response = await getOpenAIClient().responses.create({
        model: "gpt-5.6",
        input: buildStudentSimulatorInstructions(input),
      });
      return StudentMessageSchema.parse(response.output_text);
    },
  };
}

/**
 * Returns exactly one permitted learner turn. Scripted scenario turns are used
 * first; the simulator can only fill a remaining, non-adversarial turn.
 */
export async function nextScenarioLearnerTurn(
  input: StudentTurnInput,
): Promise<string | null> {
  const remaining = remainingLearnerTurns(input.scenario, input.transcript);
  if (remaining === 0) return null;

  const fixed = fixedAttackTurn(input.scenario, input.transcript);
  if (fixed) return fixed;

  const turnIndex = learnerTurnCount(input.transcript);
  const scripted = input.scenario.learnerMessages[turnIndex];
  if (scripted) return scripted;

  return (input.simulator ?? getStudentSimulator()).nextTurn({
    scenario: input.scenario,
    tutorSpec: input.tutorSpec,
    transcript: input.transcript,
    remainingLearnerTurns: remaining,
  });
}
