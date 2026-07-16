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
  return {
    type: "json_schema" as const,
    name: "course_model",
    strict: true,
    schema: z.toJSONSchema(CourseModelSchema),
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
