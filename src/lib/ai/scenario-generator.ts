import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  buildScenarioGeneratorInstructions,
  buildScenarioGeneratorRepairInstructions,
  type ScenarioGeneratorPromptInput,
} from "@/lib/ai/prompts/scenario-generator";
import { getFixtureScenarioGenerator, isFixtureRuntime } from "@/lib/fixture-runtime";
import { EvalScenarioSetSchema } from "@/lib/schemas";

export interface ScenarioGenerator {
  generate(input: ScenarioGeneratorPromptInput): Promise<unknown>;
  repair(input: ScenarioGeneratorPromptInput, invalidOutput: unknown): Promise<unknown>;
}

function responseFormat() {
  return {
    type: "json_schema" as const,
    name: "evaluation_scenarios",
    strict: true,
    schema: z.toJSONSchema(EvalScenarioSetSchema),
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

export function getScenarioGenerator(): ScenarioGenerator {
  if (isFixtureRuntime()) return getFixtureScenarioGenerator();
  return {
    generate(input) {
      return requestStructuredOutput(buildScenarioGeneratorInstructions(input));
    },
    repair(input, invalidOutput) {
      return requestStructuredOutput(
        buildScenarioGeneratorRepairInstructions(input, invalidOutput),
      );
    },
  };
}
