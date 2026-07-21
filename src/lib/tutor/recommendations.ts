import { createHash } from "node:crypto";
import type { CourseModel, TeachingBrief, TutorDesignControls } from "@/lib/schemas";
import { listTutorCatalog, type TutorCatalogTemplate } from "./catalog";

export const TUTOR_RECOMMENDATION_VERSION = "1" as const;
export type RecommendationPreferences = Pick<TutorDesignControls, "diagnoseBeforeExplain" | "hintEscalation" | "offTopicHandling" | "maxWords">;

export function recommendationFingerprint(brief: TeachingBrief, model: CourseModel, preferences: RecommendationPreferences) {
  const observations = model.pedagogicalEvidence.map(({ observation, status }) => `${observation}:${status}`).sort();
  return createHash("sha256").update(JSON.stringify({ version: TUTOR_RECOMMENDATION_VERSION, context: brief.context, purpose: brief.purpose, objectives: [...brief.objectives].sort(), tone: brief.style.tone, observations, preferences })).digest("hex");
}

function score(template: TutorCatalogTemplate, brief: TeachingBrief, model: CourseModel, preferences: RecommendationPreferences) {
  const observationWeights = new Map(model.pedagogicalEvidence.map(({ observation, status }) => [observation, status === "teacher_confirmed" ? 12 : status === "proposed" ? 4 : 0]));
  let value = template.relevantObservations.reduce((total, observation) => total + (observationWeights.get(observation) ?? 0), 0);
  if (template.defaultControls.hintEscalation === preferences.hintEscalation) value += 6;
  if (template.defaultControls.offTopicHandling === preferences.offTopicHandling) value += 2;
  if (brief.purpose === "revision" && template.archetypeId === "retrieval-practice") value += 20;
  if (brief.purpose === "guided_practice" && ["guided-practice", "worked-example-fading"].includes(template.archetypeId)) value += 16;
  if (brief.purpose === "conceptual_learning" && ["socratic", "inquiry-case-based", "metacognitive-reflection"].includes(template.archetypeId)) value += 14;
  if (brief.purpose === "exam_preparation" && ["mastery-checkpoint", "guided-practice", "explicit-instruction"].includes(template.archetypeId)) value += 16;
  return value;
}

export function recommendTutorStyles(brief: TeachingBrief, model: CourseModel, preferences: RecommendationPreferences) {
  return listTutorCatalog()
    .filter((template) => preferences.diagnoseBeforeExplain || !template.requiresDiagnosis)
    .map((template) => ({ template, score: score(template, brief, model, preferences) }))
    .sort((left, right) => right.score - left.score || left.template.rank - right.template.rank)
    .slice(0, 3);
}
