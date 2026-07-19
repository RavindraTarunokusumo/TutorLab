import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  getFixtureCourseSynthesizer,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  buildCourseSynthesizerInstructions,
  type CourseSynthesisPromptInput,
} from "@/lib/ai/prompts/course-synthesizer";
import { CourseModelSchema, type CourseModel } from "@/lib/schemas";

export interface CourseSynthesizer {
  synthesize(input: CourseSynthesisPromptInput): Promise<unknown>;
  repair(
    input: CourseSynthesisPromptInput,
    invalidOutput: unknown,
  ): Promise<unknown>;
}

function responseFormat() {
  const schema = z.toJSONSchema(CourseModelSchema) as Record<string, unknown>;
  const normalize = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if ("propertyNames" in node) {
      for (const key of Object.keys(node)) delete node[key];
      node.type = "string";
      return;
    }
    const properties = node.properties;
    if (properties && typeof properties === "object") {
      const fields = properties as Record<string, unknown>;
      const required = new Set(Array.isArray(node.required) ? node.required : []);
      for (const [key, field] of Object.entries(fields)) {
        if (!required.has(key)) {
          fields[key] = { anyOf: [field, { type: "null" }] };
        }
        normalize(fields[key]);
      }
      node.required = Object.keys(fields);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(normalize);
    if (node.items) normalize(node.items);
    if (node.$defs && typeof node.$defs === "object") {
      Object.values(node.$defs).forEach(normalize);
    }
  };
  normalize(schema);
  return {
    type: "json_schema" as const,
    name: "course_model",
    strict: true,
    schema,
  };
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6-terra",
    input: prompt,
    text: { format: responseFormat() },
  });
  const stripOptionalNulls = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripOptionalNulls);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== null)
        .map(([key, nested]) => [key, stripOptionalNulls(nested)]),
    );
  };
  return stripOptionalNulls(JSON.parse(response.output_text));
}

export function getCourseSynthesizer(): CourseSynthesizer {
  if (isFixtureRuntime()) return getFixtureCourseSynthesizer();
  return {
    synthesize(input) {
      return requestStructuredOutput(buildCourseSynthesizerInstructions(input));
    },
    repair(input, invalidOutput) {
      return requestStructuredOutput(
        `${buildCourseSynthesizerInstructions(input)}\n\nPrevious invalid JSON: ${JSON.stringify(invalidOutput)}\nRepair it without adding unsupported content.`,
      );
    },
  };
}

export function parseSynthesizedCourseModel(output: unknown): CourseModel {
  return CourseModelSchema.parse(output);
}
