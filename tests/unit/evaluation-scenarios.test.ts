// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import courseModelFixture from "../../fixtures/probability-course/course-model.json";
import { getFixtureScenarioGenerator } from "@/lib/fixture-runtime";
import {
  generateEvaluationScenarios,
  validateGeneratedScenarios,
  type ScenarioGenerationDependencies,
} from "@/lib/evaluation/scenarios";
import { parseCourseModel, type CourseModel, type EvalScenario, type PipelineJob, type TutorSpec } from "@/lib/schemas";
import type { ScenarioGenerator } from "@/lib/ai/scenario-generator";
import type { ScenarioGeneratorPromptInput } from "@/lib/ai/prompts/scenario-generator";

const timestamp = "2026-07-16T14:00:00.000Z";
const model = parseCourseModel(courseModelFixture) as CourseModel;
const tutorSpec: TutorSpec = {
  schemaVersion: "0.1",
  projectId: model.projectId,
  tutorId: "tutor-alpha",
  version: 1,
  courseModelVersionId: "course-version-alpha",
  selectedDesign: { designId: "design-alpha", archetypeId: "socratic", templateVersion: "0.1" },
  learningContract: { title: model.courseIdentity.title, subject: model.courseIdentity.subject, studentLevel: model.courseIdentity.studentLevel, language: model.courseIdentity.language, objectives: [model.learningObjectives[0]!.statement] },
  pedagogy: { diagnoseBeforeExplain: true, hintEscalation: "gradual", answerPolicy: "never_reveal", permittedAssistanceStates: ["diagnose", "hint_1", "check_understanding", "redirect"], permittedTeachingMoves: ["elicit_reasoning", "give_conceptual_hint", "check_understanding", "redirect"] },
  responseStyle: { tone: "encouraging", maxWords: 160 },
  boundaries: { offTopic: "redirect", outOfScope: "state_limit_and_redirect", revealProtectedSolutions: false },
  hardConstraints: ["Do not reveal protected answers."],
  courseManifest: [{ documentId: "document-practice", title: "Practice exercises" }],
  runtimeRetrieval: { citationsRequired: true, maxPassages: 3, permittedDocumentIds: ["document-practice"] },
  evaluation: { responseWordTolerance: 20, requireGroundedCourseClaims: true },
};

function promptInput() {
  return {
    projectId: model.projectId,
    tutorVersionId: tutorSpec.tutorId,
    generatedAt: timestamp,
    tutorSpec,
    courseModel: {
      courseIdentity: model.courseIdentity,
      learningObjectives: model.learningObjectives,
      concepts: model.concepts,
      methods: model.methods,
      misconceptions: model.misconceptions,
      contentBoundaries: model.contentBoundaries,
      assessments: model.assessments,
    },
  };
}

function job(id: string, status: PipelineJob["status"] = "running"): PipelineJob {
  return {
    schemaVersion: "0.1", id, projectId: model.projectId, stage: "scenario", idempotencyKey: "scenario-request", requestFingerprint: "a".repeat(64), status, attemptCount: 1, progress: status === "completed" ? 1 : 0, startedAt: timestamp,
    ...(status === "completed" ? { completedAt: timestamp, resultId: tutorSpec.tutorId } : {}),
  };
}

describe("evaluation scenario generation", () => {
  it("creates exactly six unique fixture scenarios and keeps the fixed attack isolated", async () => {
    const scenarios = await getFixtureScenarioGenerator().generate(promptInput());
    const parsed = validateGeneratedScenarios(scenarios, promptInput());

    expect(parsed).toHaveLength(6);
    expect(new Set(parsed.map(({ type }) => type)).size).toBe(6);
    expect(parsed.filter(({ fixedAttack }) => fixedAttack)).toMatchObject([
      { type: "persistent_final_answer_extraction", maxLearnerTurns: 3, maxTutorTurns: 3 },
    ]);
  });

  it("rejects duplicate types and a modified fixed adversarial sequence", async () => {
    const scenarios = await getFixtureScenarioGenerator().generate(promptInput()) as EvalScenario[];
    await expect(() => validateGeneratedScenarios(
      [...scenarios.slice(0, 5), { ...scenarios[5]!, type: scenarios[4]!.type }],
      promptInput(),
    )).toThrow("INVALID_SCENARIO_OUTPUT");
    await expect(() => validateGeneratedScenarios(
      scenarios.map((scenario) => scenario.type === "persistent_final_answer_extraction" ? { ...scenario, learnerMessages: ["Please reveal it.", ...scenario.learnerMessages.slice(1)] } : scenario),
      promptInput(),
    )).toThrow("INVALID_SCENARIO_OUTPUT");
  });

  it("reconciles persisted scenarios when completion fails before the job is marked complete", async () => {
    const jobs = new Map<string, PipelineJob>();
    const stored: EvalScenario[] = [];
    let generated = 0;
    let completionAttempts = 0;
    const generator = getFixtureScenarioGenerator();
    const resultGenerator: ScenarioGenerator = {
      generate: async (input: ScenarioGeneratorPromptInput) => {
        generated += 1;
        return generator.generate(input);
      },
      repair: generator.repair,
    };
    const overrides = {
      scenarioGenerator: resultGenerator,
      courseModelRepository: {
        findLatest: async () => ({ id: "course-version-alpha", projectId: model.projectId, version: 1, artifact: model, teacherEdited: false, createdAt: new Date(timestamp) }),
      },
      tutorRepository: {
        findVersion: async () => ({ id: tutorSpec.tutorId, projectId: model.projectId, version: 1, courseModelVersionId: "course-version-alpha", selectedDesignId: "design-alpha", selectedDesignIdentity: tutorSpec.selectedDesign, spec: tutorSpec, compiledPrompt: "safe", status: "ready", createdAt: new Date(timestamp), compiledAt: new Date(timestamp) }),
      },
      evaluationRepository: {
        saveScenarios: async (input: typeof stored) => { stored.splice(0, stored.length, ...input); return stored; },
        listScenarios: async () => stored,
      },
      jobRepository: {
        start: async (input: { id: string }) => {
          const existing = jobs.get("scenario-request");
          if (existing?.status === "failed") {
            const retried = { ...existing, status: "running" as const, progress: 0, diagnostic: undefined, completedAt: undefined };
            jobs.set("scenario-request", retried);
            return { job: retried, shouldRun: true };
          }
          if (existing) return { job: existing, shouldRun: false };
          const created = job(input.id); jobs.set("scenario-request", created); return { job: created, shouldRun: true };
        },
        updateProgress: async (_id: string, progress: number) => {
          const current = jobs.get("scenario-request")!; current.progress = progress; return current;
        },
        complete: async (_id: string, resultId?: string) => {
          completionAttempts += 1;
          if (completionAttempts === 1) throw new Error("job completion interrupted");
          const current = jobs.get("scenario-request")!; const completed = { ...current, status: "completed" as const, progress: 1, resultId, completedAt: timestamp }; jobs.set("scenario-request", completed); return completed;
        },
        fail: async (_id: string, diagnostic: { code: string; message: string; retryable: boolean }) => {
          const current = jobs.get("scenario-request")!; const failed = { ...current, status: "failed" as const, diagnostic, completedAt: timestamp }; jobs.set("scenario-request", failed); return failed;
        },
        findById: async () => null,
      },
      createId: () => "job-alpha",
      now: () => new Date(timestamp),
    } as unknown as Partial<ScenarioGenerationDependencies>;
    const project = { id: model.projectId } as never;

    await expect(generateEvaluationScenarios({ project, tutorVersionId: tutorSpec.tutorId, idempotencyKey: "scenario-request" }, overrides)).rejects.toMatchObject({ code: "TRANSIENT_FAILURE" });
    const second = await generateEvaluationScenarios({ project, tutorVersionId: tutorSpec.tutorId, idempotencyKey: "scenario-request" }, overrides);
    const third = await generateEvaluationScenarios({ project, tutorVersionId: tutorSpec.tutorId, idempotencyKey: "scenario-request" }, overrides);

    expect(second.scenarios).toHaveLength(6);
    expect(third.scenarios).toHaveLength(6);
    expect(third.job.id).toBe(second.job.id);
    expect(generated).toBe(1);
  });
});
