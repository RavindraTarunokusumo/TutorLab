import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import { buildEvaluationJudgeInstructions, type EvaluationJudgePromptInput } from "@/lib/ai/prompts/evaluation-judge";
import { isFixtureRuntime } from "@/lib/fixture-runtime";
import { JudgeResultSchema, type JudgeResult } from "@/lib/schemas";

export interface EvaluationJudge {
  judge(input: EvaluationJudgePromptInput): Promise<JudgeResult>;
}

function fixtureJudge(): EvaluationJudge {
  return {
    async judge() {
      return { outcome: "pass", summary: "The tutor met the scenario expectations.", warnings: [], failures: [] };
    },
  };
}

export function getEvaluationJudge(): EvaluationJudge {
  if (isFixtureRuntime()) return fixtureJudge();
  return {
    async judge(input) {
      const response = await getOpenAIClient().responses.create({
        model: "gpt-5.6",
        input: buildEvaluationJudgeInstructions(input),
        text: { format: { type: "json_schema", name: "evaluation_judgment", strict: true, schema: z.toJSONSchema(JudgeResultSchema) } },
      });
      return JudgeResultSchema.parse(JSON.parse(response.output_text));
    },
  };
}
