import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndEditTokenHash: vi.fn(),
  updateTeachingBrief: vi.fn(),
};

vi.mock("@/lib/projects/repository", () => ({
  getProjectRepository: () => repository,
}));

const originalSecret = process.env.PROJECT_EDIT_TOKEN_SECRET;

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-alpha",
    name: "Probability tutor",
    stage: "brief",
    teachingBrief: {},
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    updatedAt: new Date("2026-07-15T10:00:00.000Z"),
    ...overrides,
  };
}

describe("project APIs", () => {
  beforeEach(() => {
    process.env.PROJECT_EDIT_TOKEN_SECRET =
      "a-test-secret-with-at-least-32-characters";
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.PROJECT_EDIT_TOKEN_SECRET;
    } else {
      process.env.PROJECT_EDIT_TOKEN_SECRET = originalSecret;
    }
  });

  it("creates a project, sets an HTTP-only edit cookie, and never exposes token material", async () => {
    repository.create.mockResolvedValue(project());
    const { POST } = await import("@/app/api/projects/route");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "Probability tutor" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      project: expect.objectContaining({ id: "project-alpha", stage: "brief" }),
    });
    expect(JSON.stringify(body)).not.toContain("token");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=lax");
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Probability tutor",
        editTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("rejects malformed project input without touching persistence", async () => {
    const { POST } = await import("@/app/api/projects/route");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("updates a canonical brief patch when the edit cookie authorizes that project", async () => {
    const { createProject } = await import("@/lib/projects/service");
    repository.create.mockResolvedValue(project());
    const created = await createProject({ name: "Probability tutor" });
    repository.findByIdAndEditTokenHash.mockResolvedValue(project());
    repository.updateTeachingBrief.mockResolvedValue(
      project({ teachingBrief: { purpose: "guided_practice" } }),
    );
    const { PATCH } =
      await import("@/app/api/projects/[projectId]/brief/route");

    const response = await PATCH(
      new Request("http://localhost/api/projects/project-alpha/brief", {
        method: "PATCH",
        headers: {
          cookie: `tutorlab_project_edit=${created.editToken}`,
        },
        body: JSON.stringify({ purpose: "guided_practice" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      project: expect.objectContaining({
        teachingBrief: { purpose: "guided_practice" },
      }),
    });
    expect(repository.updateTeachingBrief).toHaveBeenCalledWith(
      "project-alpha",
      {
        purpose: "guided_practice",
      },
    );
  });

  it("reads the persisted stage and brief only through the project edit session", async () => {
    const { createProject } = await import("@/lib/projects/service");
    repository.create.mockResolvedValue(project());
    const created = await createProject({ name: "Probability tutor" });
    repository.findByIdAndEditTokenHash.mockResolvedValue(
      project({
        stage: "sources",
        teachingBrief: { purpose: "guided_practice" },
      }),
    );
    const { GET } = await import("@/app/api/projects/[projectId]/route");

    const response = await GET(
      new Request("http://localhost/api/projects/project-alpha", {
        headers: { cookie: `tutorlab_project_edit=${created.editToken}` },
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      project: expect.objectContaining({
        stage: "sources",
        teachingBrief: { purpose: "guided_practice" },
      }),
    });
  });

  it("uses non-revealing authorization semantics for absent and cross-project edit sessions", async () => {
    const { createProject } = await import("@/lib/projects/service");
    repository.create.mockResolvedValue(project());
    const created = await createProject({ name: "Probability tutor" });
    const { PATCH } =
      await import("@/app/api/projects/[projectId]/brief/route");

    const missingSession = await PATCH(
      new Request("http://localhost/api/projects/project-alpha/brief", {
        method: "PATCH",
        body: JSON.stringify({ purpose: "guided_practice" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );
    repository.findByIdAndEditTokenHash.mockResolvedValue(null);
    const crossProject = await PATCH(
      new Request("http://localhost/api/projects/project-beta/brief", {
        method: "PATCH",
        headers: { cookie: `tutorlab_project_edit=${created.editToken}` },
        body: JSON.stringify({ purpose: "guided_practice" }),
      }),
      { params: Promise.resolve({ projectId: "project-beta" }) },
    );

    expect(missingSession.status).toBe(401);
    expect(crossProject.status).toBe(404);
    expect(repository.updateTeachingBrief).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical brief patch before mutating the project", async () => {
    const { createProject } = await import("@/lib/projects/service");
    repository.create.mockResolvedValue(project());
    const created = await createProject({ name: "Probability tutor" });
    repository.findByIdAndEditTokenHash.mockResolvedValue(project());
    const { PATCH } =
      await import("@/app/api/projects/[projectId]/brief/route");

    const response = await PATCH(
      new Request("http://localhost/api/projects/project-alpha/brief", {
        method: "PATCH",
        headers: { cookie: `tutorlab_project_edit=${created.editToken}` },
        body: JSON.stringify({ stage: "build" }),
      }),
      { params: Promise.resolve({ projectId: "project-alpha" }) },
    );

    expect(response.status).toBe(400);
    expect(repository.updateTeachingBrief).not.toHaveBeenCalled();
  });
});
