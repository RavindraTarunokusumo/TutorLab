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

function nullable(schema: Record<string, unknown>) {
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
    name: "tutor_design_set",
    strict: true,
    schema: normalizeStrictSchema(
      z.toJSONSchema(TutorDesignSetSchema),
    ) as Record<string, unknown>,
  };
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6-terra",
    input: prompt,
    max_output_tokens: 6_000,
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
