// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
const analysis = vi.hoisted(() => ({ analyzePendingDocuments: vi.fn(), retryDocumentAnalysis: vi.fn() }));
const jobs = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects/service", () => ({
  ProjectAccessError: class ProjectAccessError extends Error { constructor(readonly status: 401 | 404) { super("access"); } },
  requireProjectAccess: auth.requireProjectAccess,
}));
vi.mock("@/lib/analysis/document-analysis", () => ({
  DocumentAnalysisError: class DocumentAnalysisError extends Error { constructor(readonly code: string) { super("analysis error"); } },
  analyzePendingDocuments: analysis.analyzePendingDocuments,
  retryDocumentAnalysis: analysis.retryDocumentAnalysis,
}));
vi.mock("@/lib/jobs/repository", () => ({ getPipelineJobRepository: () => ({ findById: jobs.findById }) }));

const job = { schemaVersion: "0.1", id: "job-alpha", projectId: "project-alpha", stage: "analysis", idempotencyKey: "analysis-key", status: "completed", attemptCount: 1, progress: 1, startedAt: "2026-07-15T12:00:00.000Z", completedAt: "2026-07-15T12:01:00.000Z" };

describe("analysis API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireProjectAccess.mockResolvedValue({ id: "project-alpha" });
    analysis.analyzePendingDocuments.mockResolvedValue(job);
    analysis.retryDocumentAnalysis.mockResolvedValue(job);
  });

  it("requires edit access before starting a batch", async () => {
    const { ProjectAccessError } = await import("@/lib/projects/service");
    auth.requireProjectAccess.mockRejectedValue(new ProjectAccessError(401));
    const { POST } = await import("@/app/api/projects/[projectId]/analyze/route");
    const response = await POST(new Request("http://localhost/api/projects/project-alpha/analyze", { method: "POST" }), { params: Promise.resolve({ projectId: "project-alpha" }) });
    expect(response.status).toBe(401);
    expect(analysis.analyzePendingDocuments).not.toHaveBeenCalled();
  });

  it("starts batch and isolated retry jobs only for authorized projects", async () => {
    const batchRoute = await import("@/app/api/projects/[projectId]/analyze/route");
    const retryRoute = await import("@/app/api/projects/[projectId]/files/[sourceId]/analyze/route");
    const batch = await batchRoute.POST(new Request("http://localhost/api/projects/project-alpha/analyze", { method: "POST" }), { params: Promise.resolve({ projectId: "project-alpha" }) });
    const retry = await retryRoute.POST(new Request("http://localhost/api/projects/project-alpha/files/source-alpha/analyze", { method: "POST" }), { params: Promise.resolve({ projectId: "project-alpha", sourceId: "source-alpha" }) });
    expect(batch.status).toBe(202);
    expect(retry.status).toBe(202);
    expect(analysis.analyzePendingDocuments).toHaveBeenCalledWith("project-alpha");
    expect(analysis.retryDocumentAnalysis).toHaveBeenCalledWith("project-alpha", "source-alpha");
  });

  it("maps source retry failures and polls only project-scoped jobs", async () => {
    const { DocumentAnalysisError } = await import("@/lib/analysis/document-analysis");
    analysis.retryDocumentAnalysis.mockRejectedValue(new DocumentAnalysisError("SOURCE_NOT_READY"));
    jobs.findById.mockResolvedValue(job);
    const retryRoute = await import("@/app/api/projects/[projectId]/files/[sourceId]/analyze/route");
    const pollRoute = await import("@/app/api/jobs/[jobId]/route");
    const retry = await retryRoute.POST(new Request("http://localhost/api/projects/project-alpha/files/source-alpha/analyze", { method: "POST" }), { params: Promise.resolve({ projectId: "project-alpha", sourceId: "source-alpha" }) });
    const poll = await pollRoute.GET(new Request("http://localhost/api/jobs/job-alpha?projectId=project-alpha"), { params: Promise.resolve({ jobId: "job-alpha" }) });
    const invalid = await pollRoute.GET(new Request("http://localhost/api/jobs/job-alpha"), { params: Promise.resolve({ jobId: "job-alpha" }) });
    expect(retry.status).toBe(404);
    expect(await poll.json()).toEqual({ job });
    expect(jobs.findById).toHaveBeenCalledWith("project-alpha", "job-alpha");
    expect(invalid.status).toBe(400);
  });
});
