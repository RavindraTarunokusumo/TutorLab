import { describe, expect, it } from "vitest";
import { furthestProjectStage, isProjectStageReachable } from "@/lib/projects/stages";

const none = {
  hasCourseModel: false,
  hasTutorDesign: false,
  hasActiveTutor: false,
  hasEvaluation: false,
};

describe("production project stage reachability", () => {
  it("never regresses persisted progress when an earlier stage is completed again", () => {
    expect(furthestProjectStage("preview", "sources")).toBe("preview");
    expect(furthestProjectStage("preview", "preview")).toBe("preview");
    expect(furthestProjectStage("design", "build")).toBe("build");
  });

  it("unlocks Day 3 and Day 4 routes from their persisted artifacts", () => {
    expect(isProjectStageReachable("course_model", "design", { ...none, hasCourseModel: true })).toBe(true);
    expect(isProjectStageReachable("course_model", "build", { ...none, hasCourseModel: true, hasTutorDesign: true, hasActiveTutor: true })).toBe(true);
    expect(isProjectStageReachable("course_model", "preview", { ...none, hasActiveTutor: true })).toBe(true);
    expect(isProjectStageReachable("course_model", "report", { ...none, hasActiveTutor: true })).toBe(true);
  });

  it("keeps later stages locked until their durable prerequisites exist", () => {
    expect(isProjectStageReachable("course_model", "design", none)).toBe(false);
    expect(isProjectStageReachable("course_model", "build", { ...none, hasCourseModel: true, hasTutorDesign: true })).toBe(false);
    expect(isProjectStageReachable("course_model", "preview", { ...none, hasCourseModel: true, hasTutorDesign: true })).toBe(false);
    expect(isProjectStageReachable("course_model", "report", none)).toBe(false);
  });

  it("does not trust a stale advanced project stage over missing artifacts", () => {
    expect(isProjectStageReachable("preview", "preview", none)).toBe(false);
    expect(isProjectStageReachable("preview", "report", none)).toBe(false);
    expect(isProjectStageReachable("build", "report", { ...none, hasActiveTutor: true })).toBe(true);
    expect(isProjectStageReachable("build", "build", { ...none, hasCourseModel: true, hasTutorDesign: true })).toBe(false);
  });
});
