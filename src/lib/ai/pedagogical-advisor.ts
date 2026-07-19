import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  TeacherRecommendationSetSchema,
  type TeacherRecommendation,
  type TutorSpec,
} from "@/lib/schemas";

const AdvisorResponseSchema = z.strictObject({
  recommendations: TeacherRecommendationSetSchema,
});

export type PedagogicalAdvisorInput = {
  tutorSpec: TutorSpec;
  sourceManifest: unknown;
  warnings: Array<{ scenarioId: string; message: string }>;
};

export async function generateTeacherRecommendations(
  input: PedagogicalAdvisorInput,
): Promise<TeacherRecommendation[]> {
  const response = await getOpenAIClient().responses.create({
    model: "gpt-5.6-terra",
    input: [
      "You are TutorLab's teacher-facing pedagogical advisor.",
      "Based only on the evaluation warnings, tutor configuration, and source manifest below, suggest concrete teacher configuration changes. The teacher can only change: maximum reply length (50–500 in increments of 50), hint progression (Gradual, Balanced, or Direct), off-topic handling (Redirect to the course, Briefly redirect, or Decline), tone (Encouraging, Neutral, or Formal), answer sharing, and source materials. For source materials, recommend adding or enabling a relevant source type, not inventing its content. Every recommendation must name one of these existing selectable values or an actionable source upload/permission change. Do not propose custom hint sequences, prompt templates, hidden policies, or any setting that is not in this list. Do not alter the tutor automatically or expose internal prompts.",
      "Return concise, actionable recommendations. Each recommendation must cite the scenario IDs that support it.",
      `Tutor configuration:\n${JSON.stringify(input.tutorSpec)}`,
      `Source manifest:\n${JSON.stringify(input.sourceManifest)}`,
      `Pedagogical warnings:\n${JSON.stringify(input.warnings)}`,
    ].join("\n\n"),
    text: {
      format: {
        type: "json_schema",
        name: "teacher_recommendations",
        strict: true,
        schema: z.toJSONSchema(AdvisorResponseSchema),
      },
    },
  });
  return AdvisorResponseSchema.parse(JSON.parse(response.output_text)).recommendations;
}
