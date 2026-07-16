import "server-only";
import { Prisma, type PipelineJob as PrismaPipelineJob } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureJobRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import { PipelineJobSchema, type PipelineJob } from "@/lib/schemas";

export type JobFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export class JobIdempotencyConflict extends Error {
  constructor() {
    super("Idempotency key cannot be reused for a different request.");
  }
}

export interface PipelineJobRepository {
  start(input: {
    id: string;
    projectId: string;
    sourceDocumentId?: string;
    stage: PipelineJob["stage"];
    idempotencyKey: string;
    requestFingerprint?: string;
  }): Promise<{ job: PipelineJob; shouldRun: boolean }>;
  updateProgress(id: string, progress: number): Promise<PipelineJob>;
  complete(id: string, resultId?: string): Promise<PipelineJob>;
  fail(id: string, diagnostic: JobFailure): Promise<PipelineJob>;
  findById(projectId: string, id: string): Promise<PipelineJob | null>;
  findLatest?(input: {
    projectId: string;
    stage: PipelineJob["stage"];
    requestFingerprint?: string;
  }): Promise<PipelineJob | null>;
}

function toPipelineJob(job: PrismaPipelineJob): PipelineJob {
  return PipelineJobSchema.parse({
    schemaVersion: "0.1",
    id: job.id,
    projectId: job.projectId,
    ...(job.sourceDocumentId ? { sourceDocumentId: job.sourceDocumentId } : {}),
    stage: job.stage,
    idempotencyKey: job.idempotencyKey,
    ...(job.requestFingerprint ? { requestFingerprint: job.requestFingerprint } : {}),
    status: job.status,
    attemptCount: job.attemptCount,
    progress: job.progress,
    ...(job.diagnostic ? { diagnostic: job.diagnostic } : {}),
    ...(job.usage ? { usage: job.usage } : {}),
    ...(job.latencyMs === null ? {} : { latencyMs: job.latencyMs }),
    ...(job.resultId === null ? {} : { resultId: job.resultId }),
    ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
  });
}

export function getPipelineJobRepository(): PipelineJobRepository {
  if (isFixtureRuntime()) return getFixtureJobRepository();
  const db = getDb();
  return {
    async start(input) {
      let existing = await db.pipelineJob.findUnique({
        where: {
          projectId_stage_idempotencyKey: {
            projectId: input.projectId,
            stage: input.stage,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        input.requestFingerprint &&
        existing &&
        existing.requestFingerprint !== input.requestFingerprint
      ) {
        throw new JobIdempotencyConflict();
      }
      if (
        existing?.status === "running" ||
        existing?.status === "pending" ||
        existing?.status === "completed"
      ) {
        return { job: toPipelineJob(existing), shouldRun: false };
      }
      const now = new Date();
      let job: PrismaPipelineJob;
      if (existing) {
        job = await db.pipelineJob.update({
          where: { id: existing.id },
          data: {
            status: "running",
            attemptCount: { increment: 1 },
            progress: 0,
            diagnostic: Prisma.JsonNull,
            resultId: null,
            startedAt: now,
            completedAt: null,
          },
        });
      } else {
        try {
          job = await db.pipelineJob.create({
            data: {
              ...input,
              status: "running",
              attemptCount: 1,
              progress: 0,
              startedAt: now,
            },
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          ) {
            throw error;
          }
          existing = await db.pipelineJob.findUniqueOrThrow({
            where: {
              projectId_stage_idempotencyKey: {
                projectId: input.projectId,
                stage: input.stage,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (
            input.requestFingerprint &&
            existing.requestFingerprint !== input.requestFingerprint
          ) {
            throw new JobIdempotencyConflict();
          }
          return { job: toPipelineJob(existing), shouldRun: false };
        }
      }
      return { job: toPipelineJob(job), shouldRun: true };
    },
    async updateProgress(id, progress) {
      const bounded = Math.min(1, Math.max(0, progress));
      const existing = await db.pipelineJob.findUniqueOrThrow({ where: { id } });
      if (existing.status !== "running" || existing.progress >= bounded) {
        return toPipelineJob(existing);
      }
      return toPipelineJob(await db.pipelineJob.update({
        where: { id },
        data: { progress: bounded },
      }));
    },
    async complete(id, resultId) {
      return toPipelineJob(
        await db.pipelineJob.update({
          where: { id },
          data: {
            status: "completed",
            progress: 1,
            ...(resultId === undefined ? {} : { resultId }),
            completedAt: new Date(),
          },
        }),
      );
    },
    async fail(id, diagnostic) {
      return toPipelineJob(
        await db.pipelineJob.update({
          where: { id },
          data: {
            status: "failed",
            diagnostic: diagnostic as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        }),
      );
    },
    async findById(projectId, id) {
      const job = await db.pipelineJob.findFirst({ where: { projectId, id } });
      return job ? toPipelineJob(job) : null;
    },
    async findLatest(input) {
      const job = await db.pipelineJob.findFirst({
        where: {
          projectId: input.projectId,
          stage: input.stage,
          ...(input.requestFingerprint
            ? { requestFingerprint: input.requestFingerprint }
            : {}),
        },
        orderBy: { startedAt: "desc" },
      });
      return job ? toPipelineJob(job) : null;
    },
  };
}
