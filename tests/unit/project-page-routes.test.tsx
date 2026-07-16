import { describe, expect, it, beforeEach, vi } from "vitest";

const repository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndEditTokenHash: vi.fn(),
  updateTeachingBrief: vi.fn(),
};
const cookieGet = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("not-found");
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects/repository", () => ({
  getProjectRepository: () => repository,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));
vi.mock("next/navigation", () => ({ notFound }));

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-alpha",
    name: "Probability tutor",
    stage: "preview",
    teachingBrief: {},
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    updatedAt: new Date("2026-07-15T10:00:00.000Z"),
    ...overrides,
  };
}

describe("project pages", () => {
  beforeEach(() => {
    process.env.PROJECT_EDIT_TOKEN_SECRET = "a-test-secret-with-at-least-32-characters";
    vi.resetModules();
    cookieGet.mockReset();
    notFound.mockClear();
    Object.values(repository).forEach((method) => method.mockReset());
  });

  async function authorize(projectRecord = project()) {
    const { createProjectEditToken } = await import("@/lib/projects/auth");
    const editToken = createProjectEditToken();
    cookieGet.mockReturnValue({ value: editToken });
    repository.findByIdAndEditTokenHash.mockResolvedValue(projectRecord);
    return editToken;
  }

  it.each([
    ["setup", "@/app/projects/[projectId]/setup/page", "brief"],
    ["sources", "@/app/projects/[projectId]/sources/page", "sources"],
    ["course model", "@/app/projects/[projectId]/course-model/page", "course_model"],
    ["designs", "@/app/projects/[projectId]/designs/page", "design"],
    ["build", "@/app/projects/[projectId]/build/page", "build"],
    ["report", "@/app/projects/[projectId]/report/page", "report"],
    ["preview", "@/app/projects/[projectId]/preview/page", "preview"],
  ] as const)("loads the authorized %s page with its mapped stage", async (_, modulePath, routeStage) => {
    await authorize();
    const page = (await import(modulePath)).default;

    const element = await page({
      params: Promise.resolve({ projectId: "project-alpha" }),
    });

    expect(element.props).toMatchObject({
      routeStage,
      project: { id: "project-alpha", stage: "preview" },
    });
    expect(JSON.stringify(element.props)).not.toContain("editToken");
  });

  it.each([
    ["missing", undefined, undefined],
    ["invalid", "invalid-token", undefined],
    ["cross-project", "valid", null],
  ] as const)("denies a %s edit session without revealing project data", async (_, cookieValue, record) => {
    if (cookieValue === "valid") {
      const { createProjectEditToken } = await import("@/lib/projects/auth");
      cookieGet.mockReturnValue({ value: createProjectEditToken() });
      repository.findByIdAndEditTokenHash.mockResolvedValue(record);
    } else if (cookieValue) {
      cookieGet.mockReturnValue({ value: cookieValue });
    }
    const page = (await import("@/app/projects/[projectId]/setup/page")).default;

    await expect(
      page({ params: Promise.resolve({ projectId: "project-alpha" }) }),
    ).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("denies direct navigation to a locked future stage", async () => {
    await authorize(project({ stage: "sources" }));
    const page = (await import("@/app/projects/[projectId]/designs/page")).default;

    await expect(
      page({ params: Promise.resolve({ projectId: "project-alpha" }) }),
    ).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
