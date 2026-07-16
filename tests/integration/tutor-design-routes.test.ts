// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
const architect = vi.hoisted(() => ({
  generateTutorDesigns: vi.fn(),
  listLatestTutorDesigns: vi.fn(),
}));
const models = vi.hoisted(() => ({ findLatest: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects/service", () => ({
  ProjectAccessError: class ProjectAccessError extends Error {
    constructor(readonly status: 401 | 404) { super("access"); }
  },
  requireProjectAccess: auth.requireProjectAccess,
}));
vi.mock("@/lib/tutor/architect", () => ({
  TutorDesignGenerationError: class TutorDesignGenerationError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  generateTutorDesigns: architect.generateTutorDesigns,
  listLatestTutorDesigns: architect.listLatestTutorDesigns,
}));
vi.mock("@/lib/analysis/course-synthesis", () => ({
  getCourseModelRepository: () => ({ findLatest: models.findLatest }),
}));

const job = {
  schemaVersion: "0.1", id: "job-design-alpha", projectId: "project-alpha", stage: "design",
  idempotencyKey: "design-key-alpha", status: "completed", attemptCount: 1, progress: 1,
  startedAt: "2026-07-16T12:00:00.000Z", completedAt: "2026-07-16T12:00:01.000Z",
};

describe("tutor design API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireProjectAccess.mockResolvedValue({ id: "project-alpha", teachingBrief: {} });
    architect.generateTutorDesigns.mockResolvedValue({ job, designs: [] });
    architect.listLatestTutorDesigns.mockResolvedValue([]);
    models.findLatest.mockResolvedValue({ id: "course-version-alpha" });
  });

  it("requires edit access before starting design generation", async () => {
    const { ProjectAccessError } = await import("@/lib/projects/service");
    auth.requireProjectAccess.mockRejectedValue(new ProjectAccessError(401));
    const { POST } = await import("@/app/api/projects/[projectId]/designs/route");
    const response = await POST(
      new Request("http://localhost/api/projects/project-alpha/designs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "design-key-alpha" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(response.status).toBe(401);
    expect(architect.generateTutorDesigns).not.toHaveBeenCalled();
  });

  it("requires edit access before reading persisted designs", async () => {
    const { ProjectAccessError } = await import("@/lib/projects/service");
    auth.requireProjectAccess.mockRejectedValue(new ProjectAccessError(401));
    const { GET } = await import("@/app/api/projects/[projectId]/designs/route");
    const response = await GET(
      new Request("http://localhost/api/projects/project-alpha/designs"),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(response.status).toBe(401);
    expect(models.findLatest).not.toHaveBeenCalled();
  });

  it("accepts only idempotent generation input, never client-made candidates", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/designs/route");
    const invalid = await POST(
      new Request("http://localhost/api/projects/project-alpha/designs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "design-key-alpha", candidates: [{ id: "forged" }] }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    const accepted = await POST(
      new Request("http://localhost/api/projects/project-alpha/designs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "design-key-alpha", courseModelVersionId: "course-version-alpha" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(invalid.status).toBe(400);
    expect(accepted.status).toBe(201);
    expect(architect.generateTutorDesigns).toHaveBeenCalledWith({
      project: { id: "project-alpha", teachingBrief: {} },
      idempotencyKey: "design-key-alpha",
      courseModelVersionId: "course-version-alpha",
    });
  });

  it.each([
    ["COURSE_MODEL_NOT_FOUND", 404],
    ["INCOMPLETE_TEACHING_BRIEF", 409],
    ["INVALID_DESIGN_OUTPUT", 422],
  ] as const)("maps %s to its safe %i response", async (code, status) => {
    const { TutorDesignGenerationError } = await import("@/lib/tutor/architect");
    architect.generateTutorDesigns.mockRejectedValue(
      new TutorDesignGenerationError(code),
    );
    const { POST } = await import("@/app/api/projects/[projectId]/designs/route");
    const response = await POST(
      new Request("http://localhost/api/projects/project-alpha/designs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `design-key-${code.toLowerCase()}` }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });

  it("serializes the latest persisted design generation and maps safe failures", async () => {
    architect.listLatestTutorDesigns.mockResolvedValue([
      { artifact: { id: "design-alpha", title: "Tutor A" } },
      { artifact: { id: "design-beta", title: "Tutor B" } },
      { artifact: { id: "design-gamma", title: "Tutor C" } },
    ]);
    const { GET, POST } = await import("@/app/api/projects/[projectId]/designs/route");
    const read = await GET(
      new Request("http://localhost/api/projects/project-alpha/designs"),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      designs: [
        { id: "design-alpha", title: "Tutor A" },
        { id: "design-beta", title: "Tutor B" },
        { id: "design-gamma", title: "Tutor C" },
      ],
    });
    expect(architect.listLatestTutorDesigns).toHaveBeenCalledWith(
      "project-alpha",
      "course-version-alpha",
    );

    const { TutorDesignGenerationError } = await import("@/lib/tutor/architect");
    architect.generateTutorDesigns.mockRejectedValue(
      new TutorDesignGenerationError("TRANSIENT_FAILURE"),
    );
    const failed = await POST(
      new Request("http://localhost/api/projects/project-alpha/designs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "design-key-transient" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ code: "TRANSIENT_FAILURE" });
  });
});
