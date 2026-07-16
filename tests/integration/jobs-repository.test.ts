// @vitest-environment node

import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ pipelineJob: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

const record = {
  id: "job-alpha", projectId: "project-alpha", sourceDocumentId: null, stage: "analysis", idempotencyKey: "analysis-key", status: "running", attemptCount: 1, progress: 0, diagnostic: null, usage: null, latencyMs: null, resultId: null, startedAt: new Date("2026-07-15T12:00:00.000Z"), completedAt: null,
};

describe("pipeline job repository", () => {
  it("returns the already-created job when concurrent starts collide on the idempotency key", async () => {
    db.pipelineJob.findUnique.mockResolvedValue(null);
    db.pipelineJob.create
      .mockResolvedValueOnce(record)
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    db.pipelineJob.findUniqueOrThrow.mockResolvedValue(record);
    const { getPipelineJobRepository } = await import("@/lib/jobs/repository");
    const repository = getPipelineJobRepository();
    const input = { id: "job-alpha", projectId: "project-alpha", stage: "analysis" as const, idempotencyKey: "analysis-key" };

    const [first, second] = await Promise.all([repository.start(input), repository.start({ ...input, id: "job-beta" })]);

    expect([first.shouldRun, second.shouldRun].filter(Boolean)).toHaveLength(1);
    expect([first.job.id, second.job.id]).toEqual(["job-alpha", "job-alpha"]);
  });
});
