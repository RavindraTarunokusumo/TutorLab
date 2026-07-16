// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
const synthesis = vi.hoisted(() => ({ synthesizeCourseModel: vi.fn(), saveTeacherCourseModelRevision: vi.fn(), findLatest: vi.fn() }));

vi.mock("@/lib/projects/service", () => ({
  ProjectAccessError: class ProjectAccessError extends Error { constructor(readonly status: 401 | 404) { super("access"); } },
  requireProjectAccess: auth.requireProjectAccess,
}));
vi.mock("@/lib/analysis/course-synthesis", () => ({
  CourseSynthesisError: class CourseSynthesisError extends Error { constructor(readonly code: string) { super("synthesis"); } },
  synthesizeCourseModel: synthesis.synthesizeCourseModel,
  saveTeacherCourseModelRevision: synthesis.saveTeacherCourseModelRevision,
  getCourseModelRepository: () => ({ findLatest: synthesis.findLatest }),
}));

const version = { id: "version-alpha", projectId: "project-alpha", version: 1, artifact: { schemaVersion: "0.2" }, teacherEdited: false, createdAt: new Date("2026-07-15T12:00:00.000Z") };

describe("course model API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireProjectAccess.mockResolvedValue({ id: "project-alpha" });
    synthesis.synthesizeCourseModel.mockResolvedValue(version);
    synthesis.saveTeacherCourseModelRevision.mockResolvedValue({ ...version, version: 2, teacherEdited: true });
    synthesis.findLatest.mockResolvedValue(version);
  });

  it("requires edit access before returning or changing the model", async () => {
    const { ProjectAccessError } = await import("@/lib/projects/service");
    auth.requireProjectAccess.mockRejectedValue(new ProjectAccessError(401));
    const route = await import("@/app/api/projects/[projectId]/course-model/route");
    const response = await route.GET(new Request("http://localhost/api/projects/project-alpha/course-model"), { params: Promise.resolve({ projectId: "project-alpha" }) });
    expect(response.status).toBe(401);
    expect(synthesis.findLatest).not.toHaveBeenCalled();
  });

  it("synthesizes, reads, and creates a course-model revision for authorized projects", async () => {
    const synthesizeRoute = await import("@/app/api/projects/[projectId]/synthesize/route");
    const courseModelRoute = await import("@/app/api/projects/[projectId]/course-model/route");
    const created = await synthesizeRoute.POST(new Request("http://localhost/api/projects/project-alpha/synthesize", { method: "POST" }), { params: Promise.resolve({ projectId: "project-alpha" }) });
    const read = await courseModelRoute.GET(new Request("http://localhost/api/projects/project-alpha/course-model"), { params: Promise.resolve({ projectId: "project-alpha" }) });
    const patch = { schemaVersion: "0.1", projectId: "project-alpha", baseVersion: 1, operations: [{ operation: "update_concept", id: "concept-alpha", name: "Edited" }] };
    const revised = await courseModelRoute.PATCH(new Request("http://localhost/api/projects/project-alpha/course-model", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }), { params: Promise.resolve({ projectId: "project-alpha" }) });
    expect(created.status).toBe(201);
    expect(read.status).toBe(200);
    expect(revised.status).toBe(201);
    expect(synthesis.synthesizeCourseModel).toHaveBeenCalledWith("project-alpha", { discardTeacherEdits: false });
    expect(synthesis.saveTeacherCourseModelRevision).toHaveBeenCalledWith("project-alpha", patch);
  });

  it("maps malformed correction JSON to the canonical 422 response", async () => {
    const { CourseSynthesisError } = await import("@/lib/analysis/course-synthesis");
    synthesis.saveTeacherCourseModelRevision.mockRejectedValue(new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH"));
    const route = await import("@/app/api/projects/[projectId]/course-model/route");
    const response = await route.PATCH(new Request("http://localhost/api/projects/project-alpha/course-model", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{" }), { params: Promise.resolve({ projectId: "project-alpha" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "INVALID_COURSE_MODEL_PATCH" });
    expect(synthesis.saveTeacherCourseModelRevision).toHaveBeenCalledWith("project-alpha", null);
  });
});
