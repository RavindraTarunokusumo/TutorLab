import "server-only";
import {
  Prisma,
  type EvalResult as PrismaEvalResult,
  type EvalRun as PrismaEvalRun,
  type EvalScenario as PrismaEvalScenario,
} from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureEvaluationRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  EvalResultSchema,
  EvalRunSchema,
  EvalScenarioSchema,
  EvalScenarioSetSchema,
  type EvalResult,
  type EvalRun,
  type EvalScenario,
} from "@/lib/schemas";

export type EvalRunRecord = EvalRun & { createdAt: Date; updatedAt: Date };

export interface EvaluationRepository {
  saveScenarios(input: EvalScenario[]): Promise<EvalScenario[]>;
  listScenarios(projectId: string, tutorVersionId: string): Promise<EvalScenario[]>;
  findScenario(projectId: string, scenarioId: string): Promise<EvalScenario | null>;
  createRun(input: EvalRun): Promise<EvalRunRecord>;
  saveRun(input: EvalRun): Promise<EvalRunRecord>;
  claimRunExecution(input: { projectId: string; runId: string }): Promise<EvalRunRecord | null>;
  findRun(projectId: string, runId: string): Promise<EvalRunRecord | null>;
  saveResult(projectId: string, result: EvalResult): Promise<EvalResult>;
  listResults(projectId: string, runId: string): Promise<EvalResult[]>;
}

function toScenario(record: PrismaEvalScenario): EvalScenario {
  return EvalScenarioSchema.parse(record.artifact);
}

function toRun(record: PrismaEvalRun): EvalRunRecord {
  return {
    ...EvalRunSchema.parse({
      schemaVersion: "0.1",
      id: record.id,
      projectId: record.projectId,
      tutorVersionId: record.tutorVersionId,
      scenarioIds: record.scenarioIds,
      status: record.status,
      readiness: record.readiness,
      passCount: record.passCount,
      warningCount: record.warningCount,
      ...(record.startedAt ? { startedAt: record.startedAt.toISOString() } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt.toISOString() } : {}),
    }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toResult(record: PrismaEvalResult): EvalResult {
  return EvalResultSchema.parse({
    schemaVersion: "0.1",
    id: record.id,
    evalRunId: record.evalRunId,
    scenarioId: record.scenarioId,
    status: record.status,
    transcript: record.transcript,
    deterministicChecks: record.deterministicChecks,
    ...(record.judgeResult ? { judgeResult: record.judgeResult } : {}),
    ...(record.usage ? { usage: record.usage } : {}),
    ...(record.diagnostic ? { diagnostic: record.diagnostic } : {}),
    ...(record.startedAt ? { startedAt: record.startedAt.toISOString() } : {}),
    ...(record.completedAt ? { completedAt: record.completedAt.toISOString() } : {}),
  });
}

function runData(run: EvalRun): Prisma.EvalRunUncheckedCreateInput {
  return {
    id: run.id,
    projectId: run.projectId,
    tutorVersionId: run.tutorVersionId,
    scenarioIds: run.scenarioIds as Prisma.InputJsonValue,
    status: run.status,
    readiness: run.readiness,
    passCount: run.passCount,
    warningCount: run.warningCount,
    ...(run.startedAt ? { startedAt: new Date(run.startedAt) } : {}),
    ...(run.completedAt ? { completedAt: new Date(run.completedAt) } : {}),
  };
}

function resultData(
  result: EvalResult,
): Omit<Prisma.EvalResultUncheckedCreateInput, "projectId"> {
  return {
    id: result.id,
    evalRunId: result.evalRunId,
    scenarioId: result.scenarioId,
    status: result.status,
    transcript: result.transcript as Prisma.InputJsonValue,
    deterministicChecks: result.deterministicChecks as Prisma.InputJsonValue,
    ...(result.judgeResult
      ? { judgeResult: result.judgeResult as Prisma.InputJsonValue }
      : {}),
    ...(result.usage ? { usage: result.usage as Prisma.InputJsonValue } : {}),
    ...(result.diagnostic
      ? { diagnostic: result.diagnostic as Prisma.InputJsonValue }
      : {}),
    ...(result.startedAt ? { startedAt: new Date(result.startedAt) } : {}),
    ...(result.completedAt ? { completedAt: new Date(result.completedAt) } : {}),
  };
}

export function getEvaluationRepository(): EvaluationRepository {
  if (isFixtureRuntime()) return getFixtureEvaluationRepository();
  const db = getDb();
  return {
    async saveScenarios(input) {
      const scenarios = EvalScenarioSetSchema.parse(input);
      const projectId = scenarios[0]!.projectId;
      const tutorVersionId = scenarios[0]!.tutorVersionId;
      if (scenarios.some((scenario) => scenario.projectId !== projectId || scenario.tutorVersionId !== tutorVersionId)) {
        throw new Error("Evaluation scenarios must have one project and tutor version");
      }
      await db.evalScenario.createMany({
        data: scenarios.map((scenario) => ({
          id: scenario.id,
          projectId: scenario.projectId,
          tutorVersionId: scenario.tutorVersionId,
          type: scenario.type,
          artifact: scenario as Prisma.InputJsonValue,
          createdAt: new Date(scenario.createdAt),
        })),
      });
      return (await db.evalScenario.findMany({
        where: { projectId, tutorVersionId },
        orderBy: { createdAt: "asc" },
      })).map(toScenario);
    },
    async listScenarios(projectId, tutorVersionId) {
      return (await db.evalScenario.findMany({
        where: { projectId, tutorVersionId },
        orderBy: { createdAt: "asc" },
      })).map(toScenario);
    },
    async findScenario(projectId, scenarioId) {
      const scenario = await db.evalScenario.findUnique({
        where: { projectId_id: { projectId, id: scenarioId } },
      });
      return scenario ? toScenario(scenario) : null;
    },
    async createRun(input) {
      const run = EvalRunSchema.parse(input);
      const scenarios = await db.evalScenario.findMany({
        where: {
          projectId: run.projectId,
          tutorVersionId: run.tutorVersionId,
          id: { in: run.scenarioIds },
        },
        select: { id: true },
      });
      if (scenarios.length !== run.scenarioIds.length) {
        throw new Error("Evaluation run scenarios are unavailable for this tutor version");
      }
      return toRun(await db.evalRun.create({ data: runData(run) }));
    },
    async saveRun(input) {
      const run = EvalRunSchema.parse(input);
      const existing = await db.evalRun.findUnique({
        where: { projectId_id: { projectId: run.projectId, id: run.id } },
        select: { projectId: true, tutorVersionId: true, scenarioIds: true },
      });
      if (!existing) throw new Error("Evaluation run not found");
      const existingScenarioIds = EvalRunSchema.shape.scenarioIds.parse(existing.scenarioIds);
      if (
        existing.tutorVersionId !== run.tutorVersionId ||
        existingScenarioIds.length !== run.scenarioIds.length ||
        existingScenarioIds.some((id, index) => id !== run.scenarioIds[index])
      ) {
        throw new Error("Evaluation run tutor and scenarios are immutable");
      }
      return toRun(await db.evalRun.update({
        where: { id: run.id },
        data: {
          status: run.status,
          readiness: run.readiness,
          passCount: run.passCount,
          warningCount: run.warningCount,
          ...(run.startedAt ? { startedAt: new Date(run.startedAt) } : { startedAt: null }),
          ...(run.completedAt ? { completedAt: new Date(run.completedAt) } : { completedAt: null }),
        },
      }));
    },
    async claimRunExecution(input) {
      const claimed = await db.evalRun.updateMany({
        where: {
          projectId: input.projectId,
          id: input.runId,
          OR: [
            { status: "pending" },
            { status: "failed" },
          ],
        },
        data: { status: "running", readiness: "pending", completedAt: null, startedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return toRun(await db.evalRun.findUniqueOrThrow({ where: { projectId_id: { projectId: input.projectId, id: input.runId } } }));
    },
    async findRun(projectId, runId) {
      const run = await db.evalRun.findUnique({
        where: { projectId_id: { projectId, id: runId } },
      });
      return run ? toRun(run) : null;
    },
    async saveResult(projectId, input) {
      const result = EvalResultSchema.parse(input);
      const run = await db.evalRun.findUnique({
        where: { projectId_id: { projectId, id: result.evalRunId } },
        select: { id: true, tutorVersionId: true, scenarioIds: true },
      });
      const scenario = await db.evalScenario.findUnique({
        where: { projectId_id: { projectId, id: result.scenarioId } },
        select: { id: true, tutorVersionId: true },
      });
      if (
        !run ||
        !scenario ||
        scenario.tutorVersionId !== run.tutorVersionId ||
        !EvalRunSchema.shape.scenarioIds.parse(run.scenarioIds).includes(result.scenarioId)
      ) {
        throw new Error("Evaluation result is outside this run");
      }
      const data = resultData(result);
      return toResult(await db.evalResult.upsert({
        where: { evalRunId_scenarioId: { evalRunId: result.evalRunId, scenarioId: result.scenarioId } },
        create: { ...data, projectId },
        update: {
          status: data.status,
          transcript: data.transcript,
          deterministicChecks: data.deterministicChecks,
          judgeResult: data.judgeResult ?? Prisma.JsonNull,
          usage: data.usage ?? Prisma.JsonNull,
          diagnostic: data.diagnostic ?? Prisma.JsonNull,
          startedAt: data.startedAt ?? null,
          completedAt: data.completedAt ?? null,
        },
      }));
    },
    async listResults(projectId, runId) {
      return (await db.evalResult.findMany({
        where: { projectId, evalRunId: runId },
        orderBy: { createdAt: "asc" },
      })).map(toResult);
    },
  };
}
