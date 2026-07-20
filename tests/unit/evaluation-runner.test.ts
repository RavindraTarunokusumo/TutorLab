// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluationFingerprint, readiness, runTutorEvaluation, CONCURRENCY } from "@/lib/evaluation/runner";
import { JobIdempotencyConflict } from "@/lib/jobs/repository";
import type { EvalResult, EvalRun, EvalScenario, PipelineJob, TutorSpec } from "@/lib/schemas";
import type { EvalRunRecord } from "@/lib/evaluation/repository";
import type { TutorRuntimePromptInput } from "@/lib/ai/prompts/tutor-runtime";

const stamp = "2026-07-16T12:00:00.000Z";
const spec: TutorSpec = {
  schemaVersion: "0.1", projectId: "project-1", tutorId: "tutor-1", version: 1, courseModelVersionId: "model-1",
  selectedDesign: { designId: "design-1", archetypeId: "socratic", templateVersion: "0.1" },
  learningContract: { title: "Probability", subject: "Math", studentLevel: "First year", language: "English", objectives: ["Reason about probability."] },
  pedagogy: { diagnoseBeforeExplain: true, hintEscalation: "gradual", permittedAssistanceStates: ["diagnose", "hint_1", "redirect"], permittedTeachingMoves: ["elicit_reasoning", "redirect"] },
  responseStyle: { tone: "encouraging", maxWords: 100 }, boundaries: { offTopic: "redirect", outOfScope: "state_limit_and_redirect", revealProtectedSolutions: false }, hardConstraints: ["Never reveal protected answers."],
  courseManifest: [{ documentId: "notes-1", title: "Notes" }], runtimeRetrieval: { citationsRequired: true, maxPassages: 3, permittedDocumentIds: ["notes-1"] }, evaluation: { responseWordTolerance: 20, requireGroundedCourseClaims: true },
};

function scenario(id: string): EvalScenario {
  return { schemaVersion: "0.1", id, projectId: "project-1", tutorVersionId: "tutor-1", type: "confident_misconception", title: `Scenario ${id}`, learnerPersona: "Learner", learnerIntent: "Learn safely.", learnerMessages: ["Help me with probability."], expectedBehavior: ["Ask a grounded question."], prohibitedBehavior: ["Give an answer."], deterministicCriteria: ["Cite notes."], maxLearnerTurns: 1, maxTutorTurns: 1, fixedAttack: false, createdAt: stamp };
}

function harness(scenarios: EvalScenario[]) {
  const results = new Map<string, EvalResult>();
  const runs = new Map<string, EvalRunRecord>();
  const active = { count: 0, peak: 0 };
  const job: PipelineJob = { schemaVersion: "0.1", id: "job-1", projectId: "project-1", stage: "evaluation", idempotencyKey: "key", status: "running", attemptCount: 1, progress: 0, startedAt: stamp };
  let ids = 0;
  return {
    active,
    overrides: {
      createId: () => `id-${++ids}`,
      now: () => new Date(stamp),
      tutorRepository: { findVersion: async () => ({ id: "tutor-1", projectId: "project-1", version: 1, courseModelVersionId: "model-1", selectedDesignId: "design-1", selectedDesignIdentity: spec.selectedDesign, spec, compiledPrompt: "safe", status: "ready", createdAt: new Date(stamp), compiledAt: new Date(stamp) }) },
      sourceRepository: { list: async () => [{ id: "notes-1", projectId: "project-1", name: "Notes", role: "lecture", authority: "course_authoritative", permissions: { useForCourseModel: true, useForPedagogyDrafting: true, useForRuntimeRetrieval: true, useForEvaluation: true, revealExcerptsToStudents: true }, containsProtectedSolutions: false, contentHash: "a".repeat(64), mimeType: "application/pdf", sizeBytes: 1, processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus: "ready", pageCount: 1, extractedTokenCount: 1 } }] },
      evaluationRepository: {
        listScenarios: async () => scenarios,
        createRun: async (run: EvalRun) => { const record: EvalRunRecord = { ...run, createdAt: new Date(stamp), updatedAt: new Date(stamp) }; runs.set(run.id, record); return record; },
        saveRun: async (run: EvalRun) => { const record: EvalRunRecord = { ...run, createdAt: new Date(stamp), updatedAt: new Date(stamp) }; runs.set(run.id, record); return record; },
        claimRunExecution: async ({ runId }: { runId: string }) => { const run = runs.get(runId); return run ? { ...run, status: "running" as const, startedAt: stamp } : null; },
        findRun: async (_projectId: string, id: string) => runs.get(id) ?? null,
        saveResult: async (_projectId: string, result: EvalResult) => { results.set(`${result.evalRunId}:${result.scenarioId}`, result); return result; },
        listResults: async (_projectId: string, runId: string) => [...results.values()].filter((result) => result.evalRunId === runId),
      },
      jobRepository: { start: async () => ({ job, shouldRun: true }), updateProgress: async (_id: string, progress: number) => ({ ...job, progress }), setResultId: async (_id: string, resultId: string) => ({ ...job, resultId }), complete: async (_id: string, resultId?: string) => ({ ...job, status: "completed" as const, progress: 1, resultId, completedAt: stamp }), fail: async (_id: string, diagnostic: { code: string; message: string; retryable: boolean }) => ({ ...job, status: "failed" as const, diagnostic, completedAt: stamp }) },
      courseModelRepository: { findLatest: async () => null, findById: async () => ({ id: "model-1", artifact: { protectedSolutions: [] } }) },
      simulator: { nextTurn: async () => "unused" },
      runtime: { reply: async () => { active.count += 1; active.peak = Math.max(active.peak, active.count); await new Promise((resolve) => setTimeout(resolve, 5)); active.count -= 1; return { content: "What does the course rule suggest?", teachingMove: "elicit_reasoning" as const, proposedState: "hint_1" as const, boundary: "none" as const, citedDocumentIds: ["notes-1"] }; } },
      judge: { judge: async () => ({ outcome: "pass" as const, summary: "Passed safely.", warnings: [], failures: [] }) },
    },
  };
}

describe("evaluation runner", () => {
  it("uses a stable sha256 evaluation fingerprint and revises runs with more than two warnings", () => {
    expect(evaluationFingerprint("tutor-1", ["b", "a"])).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluationFingerprint("tutor-1", ["a", "b"])).toBe(evaluationFingerprint("tutor-1", ["b", "a"]));
    expect(readiness([{ status: "passed", judgeResult: { warnings: [{}, {}, {}] } } as never, ...Array.from({ length: 5 }, () => ({ status: "passed", judgeResult: { warnings: [] } } as never))], 6).readiness).toBe("needs_revision");
  });
  it("caps independent scenario execution at three and persists run readiness", async () => {
    const setup = harness(["a", "b", "c", "d", "e", "f"].map(scenario));
    const result = await runTutorEvaluation({ projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" }, setup.overrides as never);
    expect(CONCURRENCY).toBe(3);
    expect(setup.active.peak).toBeLessThanOrEqual(3);
    expect(result.results).toHaveLength(6);
    expect(result.run.readiness).toBe("ready");
  });

  it("reruns only the selected scenario set", async () => {
    const setup = harness([scenario("a"), scenario("b")]);
    const result = await runTutorEvaluation({ projectId: "project-1", tutorVersionId: "tutor-1", scenarioIds: ["b"], idempotencyKey: "key" }, setup.overrides as never);
    expect(result.run.scenarioIds).toEqual(["b"]);
    expect(result.results).toHaveLength(1);
  });

  it("isolates an individual runtime error and records safe terminal progress", async () => {
    const setup = harness(["a", "b", "c", "d", "e", "f"].map(scenario));
    let calls = 0;
    const result = await runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, runtime: { reply: async () => { calls += 1; if (calls === 1) throw new Error("provider failure"); return { content: "What does the course rule suggest?", teachingMove: "elicit_reasoning" as const, proposedState: "hint_1" as const, boundary: "none" as const, citedDocumentIds: ["notes-1"] }; } } } as never,
    );
    expect(result.results).toHaveLength(6);
    expect(result.results.filter(({ status }) => status === "error")).toHaveLength(1);
    expect(result.run.readiness).toBe("needs_revision");
  });

  it("rejects judge findings without exact transcript evidence", async () => {
    const setup = harness([scenario("a")]);
    const result = await runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, judge: { judge: async () => ({ outcome: "warning" as const, summary: "Needs attention.", warnings: [{ code: "unsupported", message: "Unsupported finding.", evidenceTurnIds: ["missing-turn"] }], failures: [] }) } } as never,
    );
    expect(result.results[0]?.status).toBe("error");
  });

  it("persists pollable progress after each completed scenario", async () => {
    const setup = harness(["a", "b", "c", "d", "e", "f"].map(scenario));
    const progress: number[] = [];
    await runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, jobRepository: { ...setup.overrides.jobRepository, updateProgress: async (_id: string, value: number) => { progress.push(value); return { schemaVersion: "0.1", id: "job-1", projectId: "project-1", stage: "evaluation", idempotencyKey: "key", status: "running", attemptCount: 1, progress: value, startedAt: stamp }; } } } as never,
    );
    expect(progress).toHaveLength(6);
    expect(progress.at(-1)).toBe(1);
  });

  it("uses the exact tutor course-model version for protected summaries", async () => {
    const setup = harness(["a", "b", "c", "d", "e", "f"].map(scenario));
    const findById = vi.fn(async () => ({ id: "model-1", artifact: { protectedSolutions: [{ summary: "legacy-answer" }] } }));
    const result = await runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, courseModelRepository: { findById, findLatest: async () => ({ id: "newer-model", artifact: { protectedSolutions: [] } }) }, runtime: { reply: async () => ({ content: "legacy-answer", teachingMove: "elicit_reasoning" as const, proposedState: "hint_1" as const, boundary: "none" as const, citedDocumentIds: ["notes-1"] }) } } as never,
    );
    expect(findById).toHaveBeenCalledWith("project-1", "model-1");
    expect(result.results.every(({ status }) => status === "failed")).toBe(true);
  });

  it("excludes sources that are not permitted for evaluation and records safe usage", async () => {
    const setup = harness([scenario("a")]);
    const received: unknown[][] = [];
    const result = await runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, sourceRepository: { list: async () => [{ id: "notes-1", projectId: "project-1", name: "Notes", role: "lecture", authority: "course_authoritative", permissions: { useForCourseModel: true, useForPedagogyDrafting: true, useForRuntimeRetrieval: true, useForEvaluation: false, revealExcerptsToStudents: true }, containsProtectedSolutions: false, contentHash: "a".repeat(64), mimeType: "application/pdf", sizeBytes: 1, processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus: "ready", pageCount: 1, extractedTokenCount: 1 } }] }, runtime: { reply: async (input: TutorRuntimePromptInput) => { received.push(input.sources); return { content: "What should we reason about?", teachingMove: "elicit_reasoning" as const, proposedState: "hint_1" as const, boundary: "none" as const, citedDocumentIds: [] }; } } } as never,
    );
    expect(received).toEqual([[]]);
    expect(result.results[0]?.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("maps repository idempotency conflicts to the public runner error", async () => {
    const setup = harness([scenario("a")]);
    await expect(runTutorEvaluation(
      { projectId: "project-1", tutorVersionId: "tutor-1", idempotencyKey: "key" },
      { ...setup.overrides, jobRepository: { ...setup.overrides.jobRepository, start: async () => { throw new JobIdempotencyConflict(); } } } as never,
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
});
