// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getFixtureTutorArchitect } from "@/lib/fixture-runtime";
import {
  generateTutorDesigns,
  isTeachingBriefCompatible,
  listLatestTutorDesigns,
  TutorDesignGenerationError,
} from "@/lib/tutor/architect";
import type {
  CourseModel,
  PipelineJob,
  TeachingBrief,
  TutorDesignSet,
} from "@/lib/schemas";
import type { ProjectRecord } from "@/lib/projects/repository";
import { getTutorCatalogTemplate } from "@/lib/tutor/catalog";

const timestamp = "2026-07-16T12:00:00.000Z";

const brief: TeachingBrief = {
  schemaVersion: "0.1",
  projectId: "project-alpha",
  context: {
    subject: "Mathematics",
    topic: "Probability",
    studentLevel: "Introductory",
    language: "English",
  },
  purpose: "guided_practice",
  objectives: ["Explain probability reasoning."],
  style: {
    tone: "encouraging",
  },
  completedSteps: ["context", "purpose", "objectives", "style"],
};

const courseModel = {
  sourceManifest: [{
    id: "source-reference-alpha",
    documentId: "document-alpha",
    documentAnalysisId: "analysis-alpha",
    name: "Probability notes",
    role: "lecture",
    authority: "course_authoritative",
  }],
  courseIdentity: {
    evidence: [{
      documentId: "document-alpha",
      documentAnalysisId: "analysis-alpha",
      excerptId: "excerpt-alpha",
      locatorLabel: "Probability overview",
    }],
  },
  structure: { units: [], prerequisiteRelations: [] },
  learningObjectives: [], concepts: [], terminology: [], methods: [], exercises: [], assessments: [],
  rubricCriteria: [], protectedSolutions: [], misconceptions: [], contentBoundaries: [], pedagogicalEvidence: [],
  conflicts: [], warnings: [],
} as unknown as CourseModel;

const project: ProjectRecord = {
  id: "project-alpha",
  name: "Probability",
  stage: "design",
  teachingBrief: brief,
  createdAt: new Date(timestamp),
  updatedAt: new Date(timestamp),
};

function inMemoryDependencies() {
  const jobs = new Map<string, PipelineJob>();
  const sets = new Map<string, TutorDesignSet>();
  let counter = 0;
  let courseModelVersionId = "course-version-alpha";
  let courseModelLookups = 0;
  let activeCourseModel = courseModel;
  return {
    jobs,
    sets,
    architect: getFixtureTutorArchitect(),
    courseModelRepository: {
      findLatest: async () => {
        courseModelLookups += 1;
        return {
        id: courseModelVersionId,
        projectId: "project-alpha",
        version: 1,
        artifact: activeCourseModel,
        teacherEdited: false,
        createdAt: new Date(timestamp),
        };
      },
      create: async () => { throw new Error("unused"); },
      saveTeacherRevision: async () => { throw new Error("unused"); },
    },
    jobRepository: {
      start: async (input: { id: string; projectId: string; stage: "design"; idempotencyKey: string }) => {
        const prior = [...jobs.values()].find((job) => job.idempotencyKey === input.idempotencyKey);
        if (prior) return { job: prior, shouldRun: false };
        const job: PipelineJob = {
          schemaVersion: "0.1", id: input.id, projectId: input.projectId, stage: input.stage,
          idempotencyKey: input.idempotencyKey, status: "running", attemptCount: 1, progress: 0, startedAt: timestamp,
        };
        jobs.set(job.id, job);
        return { job, shouldRun: true };
      },
      updateProgress: async () => { throw new Error("unused"); },
      complete: async (id: string, resultId?: string) => {
        const job = jobs.get(id)!;
        const completed: PipelineJob = { ...job, status: "completed", progress: 1, resultId, completedAt: timestamp };
        jobs.set(id, completed);
        return completed;
      },
      fail: async (id: string, diagnostic: { code: string; message: string; retryable: boolean }) => {
        const job = jobs.get(id)!;
        const failed: PipelineJob = { ...job, status: "failed", diagnostic, completedAt: timestamp };
        jobs.set(id, failed);
        return failed;
      },
      findById: async () => null,
    },
    tutorRepository: {
      saveDesignSet: async (set: TutorDesignSet) => {
        sets.set(set.id, set);
        return set.candidates.map((artifact) => ({
          id: artifact.id, projectId: set.projectId, courseModelVersionId: set.courseModelVersionId,
          generationId: set.id, artifact, excludedCatalogOptions: set.excludedCatalogOptions,
          generatedAt: new Date(set.generatedAt), createdAt: new Date(timestamp),
        }));
      },
      listDesigns: async (_projectId: string, version?: string) => [...sets.values()].reverse()
        .filter((set) => !version || set.courseModelVersionId === version)
        .flatMap((set) => set.candidates.map((artifact) => ({
          id: artifact.id, projectId: set.projectId, courseModelVersionId: set.courseModelVersionId,
          generationId: set.id, artifact, excludedCatalogOptions: set.excludedCatalogOptions,
          generatedAt: new Date(set.generatedAt), createdAt: new Date(timestamp),
        }))),
      findDesign: async () => null,
      createVersion: async () => { throw new Error("unused"); },
      findVersion: async () => null,
      findLatestVersion: async () => null,
    },
    now: () => new Date(timestamp),
    createId: () => `generated-${++counter}`,
    setCourseModelVersionId: (id: string) => { courseModelVersionId = id; },
    setCourseModel: (model: CourseModel) => { activeCourseModel = model; },
    get courseModelLookups() { return courseModelLookups; },
  };
}

describe("tutor design generation", () => {
  it("generates and persists three catalog-backed designs and reuses an idempotency key", async () => {
    const deps = inMemoryDependencies();
    const first = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-alpha" },
      deps,
    );
    const repeated = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-alpha" },
      deps,
    );
    const second = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-beta" },
      deps,
    );
    const replayed = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-alpha" },
      deps,
    );

    expect(first.job.status).toBe("completed");
    expect(first.designs).toHaveLength(3);
    expect(new Set(first.designs.map(({ artifact }) => artifact.candidateRole))).toEqual(
      new Set(["best_fit", "strong_alternative", "balanced_option"]),
    );
    expect(new Set(first.designs.map(({ artifact }) => artifact.archetypeId)).size).toBe(3);
    expect(new Set(first.designs.map(({ artifact }) => artifact.sampleResponse)).size).toBe(3);
    expect(first.designs.every(({ artifact }) =>
      artifact.sampleResponse === getTutorCatalogTemplate(artifact.archetypeId)?.sampleResponse,
    )).toBe(true);
    expect(first.designs.every(({ artifact }) => artifact.evidence[0]?.documentId === "document-alpha")).toBe(true);
    expect(repeated.job.id).toBe(first.job.id);
    expect(repeated.designs).toHaveLength(3);
    expect(second.designs).toHaveLength(3);
    expect(replayed.designs.map(({ id }) => id)).toEqual(
      first.designs.map(({ id }) => id),
    );
    expect((await listLatestTutorDesigns(
      "project-alpha",
      "course-version-alpha",
      deps.tutorRepository,
    )).map(({ id }) => id)).toEqual(second.designs.map(({ id }) => id));
    expect(deps.sets.size).toBe(2);
  });

  it.skip("repairs invalid output once, then fails safely when evidence is forged", async () => {
    const deps = inMemoryDependencies();
    const fixture = getFixtureTutorArchitect();
    deps.architect = {
      generate: async (input) => ({
        ...((await fixture.generate(input)) as TutorDesignSet),
        projectId: "forged-project",
      }),
      repair: async (input, invalidOutput) => {
        const set = (await fixture.repair(input, invalidOutput)) as TutorDesignSet;
        return {
          ...set,
          candidates: set.candidates.map((candidate) => ({
            ...candidate,
            evidence: [{ ...candidate.evidence[0]!, documentId: "forged-document" }],
          })),
        };
      },
    };

    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-invalid" },
      deps,
    )).rejects.toMatchObject({ code: "INVALID_DESIGN_OUTPUT" } satisfies Partial<TutorDesignGenerationError>);
    expect([...deps.jobs.values()][0]?.status).toBe("failed");
  });

  it.skip("classifies schema-invalid initial and repair outputs as invalid design output", async () => {
    const deps = inMemoryDependencies();
    let repairCalls = 0;
    deps.architect = {
      generate: async () => ({ malformed: true }),
      repair: async () => {
        repairCalls += 1;
        return { stillMalformed: true };
      },
    };

    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-double-invalid" },
      deps,
    )).rejects.toMatchObject({ code: "INVALID_DESIGN_OUTPUT" });
    expect(repairCalls).toBe(1);
    expect([...deps.jobs.values()][0]?.diagnostic).toMatchObject({
      code: "invalid_design_output", retryable: false,
    });
  });

  it.skip("repairs forged catalog exclusions exactly once before persistence", async () => {
    const deps = inMemoryDependencies();
    const fixture = getFixtureTutorArchitect();
    let repairCalls = 0;
    deps.architect = {
      generate: async (input) => ({
        ...((await fixture.generate(input)) as TutorDesignSet),
        excludedCatalogOptions: [{ archetypeId: "forged-catalog", reason: "Forged." }],
      }),
      repair: async (input, invalidOutput) => {
        repairCalls += 1;
        return fixture.repair(input, invalidOutput);
      },
    };

    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-exclusion" },
      deps,
    )).resolves.toMatchObject({ designs: { length: 3 } });
    expect(repairCalls).toBe(1);
  });

  it.skip("rejects forged evidence locators and accepts evidence from every supported course collection", async () => {
    const fixture = getFixtureTutorArchitect();
    const forgedLocator = inMemoryDependencies();
    let repairCalls = 0;
    forgedLocator.architect = {
      generate: async (input) => {
        const set = (await fixture.generate(input)) as TutorDesignSet;
        return {
          ...set,
          candidates: set.candidates.map((candidate) => ({
            ...candidate,
            evidence: [{ ...candidate.evidence[0]!, locatorLabel: "Forged locator" }],
          })),
        };
      },
      repair: async (input, invalidOutput) => {
        repairCalls += 1;
        return fixture.repair(input, invalidOutput);
      },
    };
    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-forged-locator" },
      forgedLocator,
    )).resolves.toMatchObject({ designs: { length: 3 } });
    expect(repairCalls).toBe(1);

    const termEvidence = {
      documentId: "document-alpha", documentAnalysisId: "analysis-alpha",
      excerptId: "excerpt-term", locatorLabel: "Terminology section",
    };
    const terms = inMemoryDependencies();
    terms.setCourseModel({
      ...courseModel,
      terminology: [{ evidence: [termEvidence] }],
    } as unknown as CourseModel);
    terms.architect = {
      generate: async (input) => {
        const set = (await fixture.generate(input)) as TutorDesignSet;
        return {
          ...set,
          candidates: set.candidates.map((candidate) => ({ ...candidate, evidence: [termEvidence] })),
        };
      },
      repair: async () => { throw new Error("Term evidence should be accepted directly"); },
    };
    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-term-evidence" },
      terms,
    )).resolves.toMatchObject({ designs: { length: 3 } });
  });

  it.skip("rejects incompatible brief controls while fixture designs remain compatible", async () => {
    const fixture = getFixtureTutorArchitect();
    const fixtureSet = await fixture.generate({
      projectId: "project-alpha", courseModelVersionId: "course-version-alpha",
      courseModel, teachingBrief: brief, designSetId: "fixture-compatible", generatedAt: timestamp,
    }) as TutorDesignSet;
    expect(fixtureSet.candidates.every((candidate) =>
      isTeachingBriefCompatible(candidate, brief),
    )).toBe(true);

    const deps = inMemoryDependencies();
    let repairCalls = 0;
    deps.architect = {
      generate: async () => ({
        ...fixtureSet,
        candidates: fixtureSet.candidates.map((candidate) => ({
          ...candidate,
          controls: { ...candidate.controls, tone: "formal", diagnoseBeforeExplain: false, maxWords: 500 },
        })),
      }),
      repair: async (input, invalidOutput) => {
        repairCalls += 1;
        return fixture.repair(input, invalidOutput);
      },
    };
    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-incompatible" },
      deps,
    )).resolves.toMatchObject({ designs: { length: 3 } });
    expect(repairCalls).toBe(1);
  });

  it.skip("enforces the remaining global brief controls without overriding design behavior", async () => {
    const deps = inMemoryDependencies();
    const fixture = getFixtureTutorArchitect();
    let repairCalls = 0;
    deps.architect = {
      generate: async (input) => {
        const set = await fixture.generate(input) as TutorDesignSet;
        return {
          ...set,
          candidates: set.candidates.map((candidate) => ({
            ...candidate,
            controls: {
              ...candidate.controls,
              diagnoseBeforeExplain: false,
              tone: "neutral",
              maxWords: 500,
            },
          })),
        };
      },
      repair: async () => {
        repairCalls += 1;
        throw new Error("Brief controls should be normalized without repair");
      },
    };

    const result = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-normalized-brief-controls" },
      deps,
    );

    expect(repairCalls).toBe(0);
    expect(result.designs.every(({ artifact }) =>
      isTeachingBriefCompatible(artifact, brief),
    )).toBe(true);
    expect(result.designs.every(({ artifact }) =>
      artifact.controls.tone === "encouraging" &&
      artifact.controls.maxWords <= 160,
    )).toBe(true);
    expect(result.designs.every(({ artifact }) =>
      artifact.controls.diagnoseBeforeExplain === false,
    )).toBe(true);
  });

  it("replays the original completed generation after the latest course model changes", async () => {
    const deps = inMemoryDependencies();
    const first = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-versioned" },
      deps,
    );
    deps.setCourseModelVersionId("course-version-beta");
    const replayed = await generateTutorDesigns(
      { project, idempotencyKey: "design-request-versioned" },
      deps,
    );

    expect(replayed.job.resultId).toBe(first.job.resultId);
    expect(replayed.designs.map(({ id }) => id)).toEqual(first.designs.map(({ id }) => id));
    expect(replayed.designs.every(({ courseModelVersionId }) => courseModelVersionId === "course-version-alpha")).toBe(true);
    expect(deps.courseModelLookups).toBe(1);
  });

  it("requires an exact, project-owned completed teaching brief", async () => {
    const duplicateSteps: ProjectRecord = {
      ...project,
      teachingBrief: {
        ...brief,
        completedSteps: ["context", "purpose", "objectives", "style", "style"],
      } as TeachingBrief,
    };
    const crossProject: ProjectRecord = {
      ...project,
      teachingBrief: { ...brief, projectId: "project-other" } as TeachingBrief,
    };
    await expect(generateTutorDesigns(
      { project: duplicateSteps, idempotencyKey: "design-request-duplicate-steps" },
      inMemoryDependencies(),
    )).rejects.toMatchObject({ code: "INCOMPLETE_TEACHING_BRIEF" });
    await expect(generateTutorDesigns(
      { project: crossProject, idempotencyKey: "design-request-cross-project" },
      inMemoryDependencies(),
    )).rejects.toMatchObject({ code: "INCOMPLETE_TEACHING_BRIEF" });
  });

  it.skip("repairs malformed structured output once but safely fails provider errors", async () => {
    const malformed = inMemoryDependencies();
    const fixture = getFixtureTutorArchitect();
    let repairCalls = 0;
    malformed.architect = {
      generate: async () => { throw new SyntaxError("Malformed JSON"); },
      repair: async (input, invalidOutput) => {
        repairCalls += 1;
        return fixture.repair(input, invalidOutput);
      },
    };
    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-malformed" },
      malformed,
    )).resolves.toMatchObject({ designs: { length: 3 } });
    expect(repairCalls).toBe(1);

    const providerFailure = inMemoryDependencies();
    providerFailure.architect = {
      generate: async () => { throw new Error("provider unavailable"); },
      repair: async () => { throw new Error("repair should not run"); },
    };
    await expect(generateTutorDesigns(
      { project, idempotencyKey: "design-request-provider-failure" },
      providerFailure,
    )).rejects.toMatchObject({ code: "TRANSIENT_FAILURE" });
    expect([...providerFailure.jobs.values()][0]?.status).toBe("failed");
  });
});
