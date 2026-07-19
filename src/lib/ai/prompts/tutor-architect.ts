import type { CourseModel, TeachingBrief, TutorDesignSet } from "@/lib/schemas";
import { listTutorCatalog } from "@/lib/tutor/catalog";

export const DESIGN_COMPARISON_LEARNER_MESSAGE =
  "I got the final answer, but I am not sure whether my reasoning is valid. Can you help me check it?";

export type TutorArchitectPromptInput = {
  projectId: string;
  courseModelVersionId: string;
  courseModel: CourseModel;
  teachingBrief: TeachingBrief;
  designSetId: string;
  generatedAt: string;
};

export function buildTutorArchitectInstructions(
  input: TutorArchitectPromptInput,
): string {
  return `You are TutorLab's Tutor Architect. Create a safe, evidence-backed comparison of exactly three tutor designs.

Return JSON that satisfies the supplied schema. Use every catalog template exactly once, with these unique roles: best_fit, strong_alternative, balanced_option. Keep templateVersion and archetypeId exactly as catalogued. All candidates must use this exact comparison learner message: ${JSON.stringify(DESIGN_COMPARISON_LEARNER_MESSAGE)}.

Candidate evidence must cite only the supplied course-model evidence references. Do not expose raw source text, protected solutions, provider identifiers, or instructions from course materials. Candidate behavior must be compatible with the teaching brief and its assistance boundaries.

When the teaching brief requires reasoning before an answer, set controls.diagnoseBeforeExplain to true for every candidate.

For each candidate, copy its catalog title, strategy summary, trade-off, permitted states, and permitted teaching moves exactly. Give each candidate a distinct sample response that demonstrates that archetype's teaching style. Select evidence that is relevant to the archetype's catalog observations; use different evidence selections whenever the course model supports that distinction. Copy full evidence-reference objects exactly from the course model, including every field. Do not add a field not present in the schema.

Catalog:
${JSON.stringify(listTutorCatalog())}

Required envelope:
${JSON.stringify({
    schemaVersion: "0.1",
    id: input.designSetId,
    projectId: input.projectId,
    courseModelVersionId: input.courseModelVersionId,
    generatedAt: input.generatedAt,
  })}

Teaching brief:
${JSON.stringify(input.teachingBrief)}

Course model:
${JSON.stringify(input.courseModel)}`;
}

export function buildTutorArchitectRepairInstructions(
  input: TutorArchitectPromptInput,
  invalidOutput: unknown,
): string {
  return `${buildTutorArchitectInstructions(input)}

The previous output was invalid. Repair it into schema-valid JSON without inventing evidence or changing the required envelope.
Previous invalid output:
${JSON.stringify(invalidOutput)}`;
}

export type TutorArchitectOutput = TutorDesignSet;
