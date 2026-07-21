import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/probability-course/course-model.json";
import { CourseModelSchema, TeachingBriefSchema } from "@/lib/schemas";
import { recommendTutorStyles, recommendationFingerprint } from "@/lib/tutor/recommendations";

const model = CourseModelSchema.parse(fixture);
const brief = TeachingBriefSchema.parse({
  schemaVersion: "0.1",
  projectId: "project-probability",
  context: { subject: "mathematics", topic: "statistics-probability", studentLevel: "undergraduate", language: "en" },
  purpose: "guided_practice",
  objectives: ["Explain probability reasoning."],
  style: { tone: "encouraging" },
  completedSteps: ["context", "purpose", "objectives", "style"],
});

describe("deterministic tutor recommendations", () => {
  it("returns the same ordered three styles and fingerprint for equivalent input", () => {
    const preferences = { diagnoseBeforeExplain: true, hintEscalation: "gradual" as const, offTopicHandling: "redirect" as const, maxWords: 160 };
    expect(recommendTutorStyles(brief, model, preferences).map(({ template }) => template.archetypeId)).toEqual(recommendTutorStyles(brief, model, preferences).map(({ template }) => template.archetypeId));
    expect(recommendationFingerprint(brief, model, preferences)).toBe(recommendationFingerprint(brief, model, preferences));
  });

  it("excludes every style that requires diagnosis when diagnosis is disabled", () => {
    const result = recommendTutorStyles(brief, model, { diagnoseBeforeExplain: false, hintEscalation: "direct", offTopicHandling: "redirect", maxWords: 160 });
    expect(result).toHaveLength(3);
    expect(result.every(({ template }) => !template.requiresDiagnosis)).toBe(true);
    expect(result.map(({ template }) => template.archetypeId)).not.toContain("socratic");
  });
});
