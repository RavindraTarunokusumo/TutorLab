import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getEvaluationJudge, type EvaluationJudge } from "@/lib/ai/evaluation-judge";
import { getCourseModelRepository, type CourseModelRepository } from "@/lib/analysis/course-synthesis";
import { getStudentSimulator, nextScenarioLearnerTurn, type StudentSimulator } from "@/lib/ai/student-simulator";
import { getTutorRuntime, type TutorRuntime } from "@/lib/ai/tutor-runtime";
import { evaluateDeterministicChecks, shouldSkipPedagogyJudge } from "@/lib/evaluation/deterministic";
import { getEvaluationRepository, type EvaluationRepository } from "@/lib/evaluation/repository";
import { getPipelineJobRepository, JobIdempotencyConflict, type PipelineJobRepository } from "@/lib/jobs/repository";
import { getSourceRepository, type SourceRepository } from "@/lib/sources/repository";
import { getTutorRepository, type TutorRepository, type TutorVersionRecord } from "@/lib/tutor/repository";
import { validateTransition } from "@/lib/tutor/state-machine";
import { JudgeResultSchema, type Conversation, type ConversationMessage, type EvalResult, type EvalRun, type EvalScenario, type JudgeResult, type TutorReplyMetadata } from "@/lib/schemas";

const CONCURRENCY = 3;

export type EvaluationRunDependencies = {
  evaluationRepository: EvaluationRepository;
  tutorRepository: TutorRepository;
  sourceRepository: SourceRepository;
  courseModelRepository: CourseModelRepository;
  jobRepository: PipelineJobRepository;
  runtime: TutorRuntime;
  simulator: StudentSimulator;
  judge: EvaluationJudge;
  createId: () => string;
  now: () => Date;
};

function deps(overrides?: Partial<EvaluationRunDependencies>): EvaluationRunDependencies {
  return {
    evaluationRepository: overrides?.evaluationRepository ?? getEvaluationRepository(),
    tutorRepository: overrides?.tutorRepository ?? getTutorRepository(),
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    courseModelRepository: overrides?.courseModelRepository ?? getCourseModelRepository(),
    jobRepository: overrides?.jobRepository ?? getPipelineJobRepository(),
    runtime: overrides?.runtime ?? getTutorRuntime(),
    simulator: overrides?.simulator ?? getStudentSimulator(),
    judge: overrides?.judge ?? getEvaluationJudge(),
    createId: overrides?.createId ?? randomUUID,
    now: overrides?.now ?? (() => new Date()),
  };
}

function diagnostic() {
  return { code: "scenario-execution-failed", message: "This evaluation scenario could not be completed safely.", retryable: true } as const;
}

function runtimeSources(version: TutorVersionRecord, sources: Awaited<ReturnType<SourceRepository["list"]>>) {
  const allowed = new Set(version.spec.runtimeRetrieval.permittedDocumentIds);
  return sources.filter((source) => allowed.has(source.id) && source.permissions.useForRuntimeRetrieval && source.permissions.useForEvaluation && source.permissions.revealExcerptsToStudents && !source.containsProtectedSolutions)
    .map((source) => ({ documentId: source.id, title: source.name, passage: `Approved course material: ${source.name}.` }));
}

function replyMetadata(version: TutorVersionRecord, conversation: Conversation, draft: Awaited<ReturnType<TutorRuntime["reply"]>>, sources: ReturnType<typeof runtimeSources>, started: Date): TutorReplyMetadata {
  const transition = validateTransition({ currentState: conversation.currentState, proposedState: draft.proposedState, spec: version.spec, context: { boundary: draft.boundary, requestsFinalAnswer: draft.boundary === "protected_solution" } });
  const sourceById = new Map(sources.map((source) => [source.documentId, source]));
  return {
    schemaVersion: "0.1", teachingMove: draft.teachingMove, currentState: conversation.currentState,
    nextState: transition.nextState ?? conversation.currentState,
    citations: draft.citedDocumentIds.flatMap((id) => { const source = sourceById.get(id); return source ? [{ documentId: id, title: source.title }] : []; }),
    boundary: draft.boundary, stateFallback: transition.stateFallback,
    usage: { inputTokens: 0, outputTokens: 0, latencyMs: Math.max(0, Date.now() - started.getTime()) },
  };
}

function skippedJudge(): JudgeResult {
  return { outcome: "skipped", summary: "Pedagogy judgment was skipped after an authoritative deterministic failure.", warnings: [], failures: [] };
}

function judgeWithTranscriptEvidence(result: JudgeResult, transcript: ConversationMessage[]): JudgeResult {
  const parsed = JudgeResultSchema.parse(result);
  const turnIds = new Set(transcript.map(({ id }) => id));
  if ([...parsed.warnings, ...parsed.failures].some((finding) => finding.evidenceTurnIds.some((id) => !turnIds.has(id)))) {
    throw new Error("Judge findings must cite transcript turn IDs");
  }
  return parsed;
}

function readiness(results: EvalResult[], expectedScenarioCount: number): Pick<EvalRun, "readiness" | "passCount" | "warningCount" | "status"> {
  const passCount = results.filter((result) => result.status === "passed").length;
  const warnings = results.reduce((count, result) => count + (result.judgeResult?.warnings.length ?? 0), 0);
  if (expectedScenarioCount !== 6 || results.length !== 6 || warnings > 2 || results.some((result) => result.status !== "passed" || !["passed", "failed", "error"].includes(result.status))) return { status: "completed", readiness: "needs_revision", passCount, warningCount: warnings };
  return { status: "completed", readiness: warnings ? "ready_with_warnings" : "ready", passCount, warningCount: warnings };
}

function usage(transcript: ConversationMessage[]) {
  return transcript.reduce((total, turn) => ({
    inputTokens: total.inputTokens + (turn.metadata?.usage.inputTokens ?? 0),
    outputTokens: total.outputTokens + (turn.metadata?.usage.outputTokens ?? 0),
    latencyMs: total.latencyMs + (turn.metadata?.usage.latencyMs ?? 0),
  }), { inputTokens: 0, outputTokens: 0, latencyMs: 0 });
}

export class EvaluationRunError extends Error {
  constructor(readonly code: "IDEMPOTENCY_KEY_REUSED") { super(code); }
}

export function evaluationFingerprint(tutorVersionId: string, scenarioIds: string[]): string {
  return createHash("sha256").update(JSON.stringify({ tutorVersionId, scenarioIds: [...scenarioIds].sort() })).digest("hex");
}

async function executeScenario(run: EvalRun, scenario: EvalScenario, version: TutorVersionRecord, protectedSolutionSummaries: string[], dependencies: EvaluationRunDependencies): Promise<EvalResult> {
  const startedAt = dependencies.now().toISOString();
  await dependencies.evaluationRepository.saveResult(run.projectId, { schemaVersion: "0.1", id: dependencies.createId(), evalRunId: run.id, scenarioId: scenario.id, status: "running", transcript: [], deterministicChecks: [], startedAt });
  try {
    const sources = runtimeSources(version, await dependencies.sourceRepository.list(run.projectId));
    const transcript: ConversationMessage[] = [];
    let state: Conversation["currentState"] = "diagnose";
    while (transcript.filter((turn) => turn.role === "tutor").length < scenario.maxTutorTurns) {
      const message = await nextScenarioLearnerTurn({ scenario, tutorSpec: version.spec, transcript, simulator: dependencies.simulator });
      if (!message) break;
      transcript.push({ id: dependencies.createId(), role: "learner", content: message, createdAt: dependencies.now().toISOString() });
      const conversation: Conversation = { schemaVersion: "0.1", id: dependencies.createId(), projectId: run.projectId, tutorVersionId: version.id, mode: "student", currentState: state, messages: transcript, createdAt: startedAt, updatedAt: dependencies.now().toISOString() };
      const started = dependencies.now();
      const draft = await dependencies.runtime.reply({ compiledPrompt: version.compiledPrompt, spec: version.spec, conversation, learnerMessage: message, sources });
      const metadata = replyMetadata(version, conversation, draft, sources, started);
      state = metadata.nextState;
      transcript.push({ id: dependencies.createId(), role: "tutor", content: draft.content, metadata, createdAt: dependencies.now().toISOString() });
    }
    const checks = evaluateDeterministicChecks({ tutorSpec: version.spec, scenario, transcript, protectedSolutionSummaries, createId: dependencies.createId });
    const judgeResult = shouldSkipPedagogyJudge(checks) ? skippedJudge() : judgeWithTranscriptEvidence(await dependencies.judge.judge({ scenario, tutorSpec: version.spec, transcript }), transcript);
    const failed = checks.some((check) => !check.passed) || judgeResult.outcome === "fail";
    return dependencies.evaluationRepository.saveResult(run.projectId, { schemaVersion: "0.1", id: dependencies.createId(), evalRunId: run.id, scenarioId: scenario.id, status: failed ? "failed" : "passed", transcript, deterministicChecks: checks, judgeResult, usage: usage(transcript), startedAt, completedAt: dependencies.now().toISOString() });
  } catch (error) {
    console.error("Evaluation scenario execution failed", {
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return dependencies.evaluationRepository.saveResult(run.projectId, { schemaVersion: "0.1", id: dependencies.createId(), evalRunId: run.id, scenarioId: scenario.id, status: "error", transcript: [], deterministicChecks: [], diagnostic: diagnostic(), startedAt, completedAt: dependencies.now().toISOString() });
  }
}

async function mapLimit<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; if (item) await work(item); }
  }));
}

export async function runTutorEvaluation(input: { projectId: string; tutorVersionId: string; scenarioIds?: string[]; idempotencyKey: string; startOnly?: boolean; resume?: boolean; existingRunId?: string }, overrides?: Partial<EvaluationRunDependencies>, onReady?: (handle: { job: Awaited<ReturnType<PipelineJobRepository["start"]>>["job"]; run: EvalRun; results: EvalResult[] }) => void) {
  const dependencies = deps(overrides);
  const version = await dependencies.tutorRepository.findVersion(input.projectId, input.tutorVersionId);
  if (!version || version.status !== "ready") throw new Error("Active tutor version not found");
  const scenarios = await dependencies.evaluationRepository.listScenarios(input.projectId, input.tutorVersionId);
  const selected = input.scenarioIds?.length ? scenarios.filter((scenario) => input.scenarioIds!.includes(scenario.id)) : scenarios;
  if (!selected.length || selected.length !== (input.scenarioIds?.length ?? selected.length)) throw new Error("Evaluation scenarios are unavailable");
  let started;
  try {
    started = await dependencies.jobRepository.start({ id: dependencies.createId(), projectId: input.projectId, stage: "evaluation", idempotencyKey: input.idempotencyKey, requestFingerprint: evaluationFingerprint(input.tutorVersionId, selected.map(({ id }) => id)) });
  } catch (error) {
    if (error instanceof JobIdempotencyConflict) throw new EvaluationRunError("IDEMPOTENCY_KEY_REUSED");
    throw error;
  }
  let run: EvalRun;
  if (!started.shouldRun) {
    const existing = started.job.resultId ? await dependencies.evaluationRepository.findRun(input.projectId, started.job.resultId) : null;
    if (!existing) throw new Error("Evaluation run is still being prepared");
    const results = await dependencies.evaluationRepository.listResults(input.projectId, existing.id);
    onReady?.({ job: started.job, run: existing, results });
      if (!input.resume) return { job: started.job, run: existing, results };
    run = existing;
  } else {
    const existing = input.existingRunId
      ? await dependencies.evaluationRepository.findRun(input.projectId, input.existingRunId)
      : null;
    if (existing && (existing.tutorVersionId !== input.tutorVersionId || existing.scenarioIds.some((id, index) => id !== selected[index]?.id))) {
      throw new Error("Evaluation run is unavailable");
    }
    run = existing ?? await dependencies.evaluationRepository.createRun({ schemaVersion: "0.1", id: dependencies.createId(), projectId: input.projectId, tutorVersionId: input.tutorVersionId, scenarioIds: selected.map(({ id }) => id), status: "pending", readiness: "pending", passCount: 0, warningCount: 0 });
    await dependencies.jobRepository.setResultId?.(started.job.id, run.id);
    onReady?.({ job: { ...started.job, resultId: run.id }, run, results: [] });
  }
  if (input.startOnly) return { job: { ...started.job, resultId: run.id }, run, results: await dependencies.evaluationRepository.listResults(input.projectId, run.id) };
  const claimed = await dependencies.evaluationRepository.claimRunExecution({ projectId: input.projectId, runId: run.id });
  if (!claimed) return { job: started.job, run, results: await dependencies.evaluationRepository.listResults(input.projectId, run.id) };
  run = claimed;
  try {
  const courseModel = await dependencies.courseModelRepository.findById?.(input.projectId, version.courseModelVersionId);
  if (!courseModel) {
    const results = await Promise.all(selected.map((scenario) => dependencies.evaluationRepository.saveResult(input.projectId, {
      schemaVersion: "0.1", id: dependencies.createId(), evalRunId: run.id, scenarioId: scenario.id, status: "error", transcript: [], deterministicChecks: [],
      diagnostic: { code: "course-model-version-unavailable", message: "The course model used to compile this tutor is unavailable.", retryable: false }, startedAt: run.startedAt, completedAt: dependencies.now().toISOString(),
    })));
    const terminal = await dependencies.evaluationRepository.saveRun({ ...run, ...readiness(results, run.scenarioIds.length), completedAt: dependencies.now().toISOString() });
    const job = await dependencies.jobRepository.fail(started.job.id, { code: "course_model_version_unavailable", message: "The course model used to compile this tutor is unavailable.", retryable: false });
    return { job, run: terminal, results };
  }
  const protectedSolutionSummaries = courseModel.artifact.protectedSolutions.map(({ summary }) => summary);
  let completed = 0;
  await mapLimit(selected, CONCURRENCY, async (scenario) => {
    await executeScenario(run, scenario, version, protectedSolutionSummaries, dependencies);
    completed += 1;
    await dependencies.jobRepository.updateProgress(started.job.id, completed / selected.length);
  });
  const results = await dependencies.evaluationRepository.listResults(input.projectId, run.id);
  const terminal = await dependencies.evaluationRepository.saveRun({ ...run, ...readiness(results, run.scenarioIds.length), completedAt: dependencies.now().toISOString() });
  const job = await dependencies.jobRepository.complete(started.job.id, terminal.id);
  return { job, run: terminal, results };
  } catch {
    const current = await dependencies.evaluationRepository.listResults(input.projectId, run.id);
    const repaired = await Promise.all(current.map((result) => ["running", "not_run"].includes(result.status) ? dependencies.evaluationRepository.saveResult(input.projectId, {
      ...result, status: "error", diagnostic: { code: "evaluation-run-failed", message: "The evaluation run could not be completed safely.", retryable: true }, completedAt: dependencies.now().toISOString(),
    }) : result));
    const finished = new Set(repaired.map(({ scenarioId }) => scenarioId));
    const missing = await Promise.all(selected.filter((scenario) => !finished.has(scenario.id)).map((scenario) => dependencies.evaluationRepository.saveResult(input.projectId, {
      schemaVersion: "0.1", id: dependencies.createId(), evalRunId: run.id, scenarioId: scenario.id, status: "error", transcript: [], deterministicChecks: [],
      diagnostic: { code: "evaluation-run-failed", message: "The evaluation run could not be completed safely.", retryable: true }, startedAt: run.startedAt, completedAt: dependencies.now().toISOString(),
    })));
    const recovered = [...repaired, ...missing];
    const terminal = await dependencies.evaluationRepository.saveRun({ ...run, ...readiness(recovered, run.scenarioIds.length), completedAt: dependencies.now().toISOString() });
    const job = await dependencies.jobRepository.fail(started.job.id, { code: "evaluation_run_failed", message: "The evaluation run could not be completed safely.", retryable: true });
    return { job, run: terminal, results: recovered };
  }
}

export async function getEvaluationRun(projectId: string, runId: string, overrides?: Partial<EvaluationRunDependencies>) {
  const repository = deps(overrides).evaluationRepository;
  const run = await repository.findRun(projectId, runId);
  if (!run) return null;
  const scenarios = await repository.listScenarios(projectId, run.tutorVersionId);
  return {
    run,
    results: await repository.listResults(projectId, runId),
    scenarios: scenarios.filter((scenario) => run.scenarioIds.includes(scenario.id)),
  };
}

export { CONCURRENCY, readiness };
