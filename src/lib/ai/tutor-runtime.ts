import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import { buildTutorRuntimeInstructions, type TutorRuntimePromptInput } from "@/lib/ai/prompts/tutor-runtime";
import { isFixtureRuntime } from "@/lib/fixture-runtime";
import type { AssistanceState, TeachingMove } from "@/lib/schemas";

export type RuntimeDraft = {
  content: string;
  teachingMove: TeachingMove;
  proposedState: AssistanceState;
  boundary: "none" | "off_topic" | "out_of_scope" | "protected_solution";
  citedDocumentIds: string[];
};

const RuntimeDraftSchema = z.strictObject({
  content: z.string().trim().min(1).max(12_000),
  teachingMove: z.enum(["elicit_reasoning", "give_conceptual_hint", "give_procedural_hint", "model_worked_step", "explain_concept", "check_understanding", "summarize_learning", "redirect", "escalate"]),
  proposedState: z.enum(["diagnose", "hint_1", "hint_2", "worked_step", "explain", "check_understanding", "complete", "redirect", "escalate"]),
  boundary: z.enum(["none", "off_topic", "out_of_scope", "protected_solution"]),
  citedDocumentIds: z.array(z.string().trim().min(1)).max(12),
});

export interface TutorRuntime {
  reply(input: TutorRuntimePromptInput): Promise<RuntimeDraft>;
}

function classifyBoundary(message: string): RuntimeDraft["boundary"] {
  const lower = message.toLowerCase();
  if (/answer key|worked solution|mark scheme|give me the final answer/.test(lower)) return "protected_solution";
  if (/write my essay|medical advice|investment advice/.test(lower)) return "off_topic";
  if (/not (?:in|about) (?:this )?course|unrelated to (?:the )?course/.test(lower)) return "out_of_scope";
  return "none";
}

function fixtureReply(input: TutorRuntimePromptInput): RuntimeDraft {
  const boundary = classifyBoundary(input.learnerMessage);
  const firstSource = input.sources[0];
  if (boundary !== "none") {
    return {
      content: boundary === "protected_solution"
        ? "I can help you work through the method, but I cannot reveal a protected solution or final answer. What step have you tried?"
        : "Let’s keep this focused on the approved course material. What course concept would you like to work on?",
      teachingMove: "redirect",
      proposedState: "redirect",
      boundary,
      citedDocumentIds: [],
    };
  }
  return {
    content: firstSource
      ? `Let’s reason it through. What does the intersection of the events tell you before you calculate? We can use ${firstSource.title} as a reference.`
      : "I do not have permitted course evidence for that question, so I cannot make a course-grounded claim. Please share an approved source or ask your teacher.",
    teachingMove: "elicit_reasoning",
    proposedState: input.conversation.currentState === "diagnose" ? "hint_1" : "check_understanding",
    boundary,
    citedDocumentIds: firstSource ? [firstSource.documentId] : [],
  };
}

export function getTutorRuntime(): TutorRuntime {
  if (isFixtureRuntime()) return { reply: async (input) => fixtureReply(input) };
  return {
    async reply(input) {
      const response = await getOpenAIClient().responses.create({
        model: "gpt-5.6",
        input: buildTutorRuntimeInstructions(input),
        text: {
          format: {
            type: "json_schema",
            name: "tutor_runtime_reply",
            strict: true,
            schema: z.toJSONSchema(RuntimeDraftSchema),
          },
        },
      });
      return RuntimeDraftSchema.parse(JSON.parse(response.output_text));
    },
  };
}
