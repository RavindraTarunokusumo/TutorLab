// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const timestamp = "2026-07-16T12:00:00.000Z";
const stateDirectory = mkdtempSync(join(tmpdir(), "tutorlab-design-fixture-"));

afterEach(() => {
  delete process.env.TUTORLAB_FIXTURE_MODE;
  delete process.env.TUTORLAB_FIXTURE_STATE_PATH;
  rmSync(stateDirectory, { recursive: true, force: true });
});

describe("fixture tutor architect", () => {
  it("generates catalog-backed designs that survive a repository refresh", async () => {
    process.env.TUTORLAB_FIXTURE_MODE = "1";
    process.env.TUTORLAB_FIXTURE_STATE_PATH = join(stateDirectory, "state.json");
    const { getFixtureTutorArchitect } = await import("@/lib/fixture-runtime");
    const { getProjectRepository } = await import("@/lib/projects/repository");
    const { getCourseModelRepository } = await import("@/lib/analysis/course-synthesis");
    const { getTutorRepository } = await import("@/lib/tutor/repository");
    await getProjectRepository().create({
      id: "project-fixture", name: "Fixture project", stage: "design", editTokenHash: "fixture-token",
      teachingBrief: {
        schemaVersion: "0.1", projectId: "project-fixture",
        context: { subject: "Mathematics", topic: "Probability", studentLevel: "Introductory", language: "English" },
        purpose: "guided_practice", objectives: ["Explain reasoning."],
        assistanceBoundaries: { defaultDisclosure: "never_reveal", assessedWorkDisclosure: "never_reveal", requireReasoningBeforeAnswer: true },
        style: { tone: "encouraging", responseLength: "concise", questioningPreference: "questions_first", learnerSupports: ["step_by_step"] },
        completedSteps: ["context", "purpose", "objectives", "assistance", "style"],
      } as never,
    });
    const model = {
      sourceManifest: [{ id: "source-ref", documentId: "document-fixture", documentAnalysisId: "analysis-fixture", name: "Notes", role: "lecture", authority: "course_authoritative" }],
      courseIdentity: { evidence: [{ documentId: "document-fixture", documentAnalysisId: "analysis-fixture", excerptId: "excerpt-fixture", locatorLabel: "Notes" }] },
      learningObjectives: [], concepts: [], methods: [], rubricCriteria: [], misconceptions: [], contentBoundaries: [], pedagogicalEvidence: [],
    };
    const courseVersion = await getCourseModelRepository().create({
      projectId: "project-fixture", expectedVersion: 0, artifact: model as never, teacherEdited: false,
    });
    const set = await getFixtureTutorArchitect().generate({
      projectId: "project-fixture", courseModelVersionId: courseVersion.id,
      courseModel: model as never,
      teachingBrief: (await getProjectRepository().findById("project-fixture"))!.teachingBrief as never,
      designSetId: "design-set-fixture", generatedAt: timestamp,
    });
    await getTutorRepository().saveDesignSet(set as never);

    const refreshed = await getTutorRepository().listDesigns(
      "project-fixture",
      courseVersion.id,
    );
    expect(refreshed).toHaveLength(3);
    expect(new Set(refreshed.map(({ artifact }) => artifact.archetypeId)).size).toBe(3);
  });
});
