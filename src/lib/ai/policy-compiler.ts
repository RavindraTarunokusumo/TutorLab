import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  buildPolicyCompilerInstructions,
  buildPolicyCompilerRepairInstructions,
  type PolicyCompilerPromptInput,
} from "@/lib/ai/prompts/policy-compiler";
import {
  getFixturePolicyCompiler,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import { TutorSpecSchema } from "@/lib/schemas";

export interface PolicyCompiler {
  compile(input: PolicyCompilerPromptInput): Promise<unknown>;
  repair(input: PolicyCompilerPromptInput, invalidOutput: unknown): Promise<unknown>;
}

function responseFormat() {
  return {
    type: "json_schema" as const,
    name: "tutor_spec",
    strict: true,
    schema: z.toJSONSchema(TutorSpecSchema),
  };
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6-terra",
    input: prompt,
    text: { format: responseFormat() },
  });
  return JSON.parse(response.output_text);
}

export function getPolicyCompiler(): PolicyCompiler {
  if (isFixtureRuntime()) return getFixturePolicyCompiler();
  return {
    compile(input) {
      return requestStructuredOutput(buildPolicyCompilerInstructions(input));
    },
    repair(input, invalidOutput) {
      return requestStructuredOutput(
        buildPolicyCompilerRepairInstructions(input, invalidOutput),
      );
    },
  };
}
