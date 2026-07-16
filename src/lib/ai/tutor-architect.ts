import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  buildTutorArchitectInstructions,
  buildTutorArchitectRepairInstructions,
  type TutorArchitectPromptInput,
} from "@/lib/ai/prompts/tutor-architect";
import {
  getFixtureTutorArchitect,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import { TutorDesignSetSchema } from "@/lib/schemas";

export interface TutorArchitect {
  generate(input: TutorArchitectPromptInput): Promise<unknown>;
  repair(input: TutorArchitectPromptInput, invalidOutput: unknown): Promise<unknown>;
}

function responseFormat() {
  return {
    type: "json_schema" as const,
    name: "tutor_design_set",
    strict: true,
    schema: z.toJSONSchema(TutorDesignSetSchema),
  };
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6",
    input: prompt,
    text: { format: responseFormat() },
  });
  return JSON.parse(response.output_text);
}

export function getTutorArchitect(): TutorArchitect {
  if (isFixtureRuntime()) return getFixtureTutorArchitect();
  return {
    generate(input) {
      return requestStructuredOutput(buildTutorArchitectInstructions(input));
    },
    repair(input, invalidOutput) {
      return requestStructuredOutput(
        buildTutorArchitectRepairInstructions(input, invalidOutput),
      );
    },
  };
}
