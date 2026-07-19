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

const ScenarioResponseSchema = z.object({
  scenarios: EvalScenarioSetSchema,
});

export interface ScenarioGenerator {
  generate(input: ScenarioGeneratorPromptInput): Promise<unknown>;
  repair(input: ScenarioGeneratorPromptInput, invalidOutput: unknown): Promise<unknown>;
}

function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    anyOf: [schema, { type: "null" }],
  };
}

function normalizeStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalizeStrictSchema);
  if (!schema || typeof schema !== "object") return schema;

  const result = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      normalizeStrictSchema(value),
    ]),
  ) as Record<string, unknown>;
  const properties = result.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return result;
  }

  const required = new Set(
    Array.isArray(result.required)
      ? result.required.filter((key): key is string => typeof key === "string")
      : [],
  );
  result.properties = Object.fromEntries(
    Object.entries(properties as Record<string, unknown>).map(([key, value]) => {
      const normalized = normalizeStrictSchema(value) as Record<string, unknown>;
      return [key, required.has(key) ? normalized : nullable(normalized)];
    }),
  );
  result.required = Object.keys(properties);
  return result;
}

function responseFormat() {
  return {
    type: "json_schema" as const,
    name: "evaluation_scenarios",
    strict: true,
    schema: normalizeStrictSchema(
      z.toJSONSchema(ScenarioResponseSchema),
    ) as Record<string, unknown>,
  };
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6-luna",
    input: prompt,
    text: { format: responseFormat() },
  });
  return ScenarioResponseSchema.parse(JSON.parse(response.output_text)).scenarios;
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
