import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  findByEditTokenHash: vi.fn(),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects/repository", () => ({
  getProjectRepository: () => repository,
}));

describe("current authorized project snapshot", () => {
  beforeEach(() => {
    process.env.PROJECT_EDIT_TOKEN_SECRET =
      "a-test-secret-with-at-least-32-characters";
    repository.findByEditTokenHash.mockReset();
  });

  it("returns only the project matching the valid edit session", async () => {
    const { createProjectEditToken } = await import("@/lib/projects/auth");
    const { loadCurrentAuthorizedProjectSnapshot } = await import(
      "@/lib/projects/project-snapshot"
    );
    repository.findByEditTokenHash.mockResolvedValue({
      id: "project-preview",
      name: "Probability Course",
      stage: "preview",
      teachingBrief: {},
    });

    await expect(
      loadCurrentAuthorizedProjectSnapshot(createProjectEditToken()),
    ).resolves.toEqual({
      id: "project-preview",
      name: "Probability Course",
      stage: "preview",
      teachingBrief: {},
    });
    expect(repository.findByEditTokenHash).toHaveBeenCalledOnce();
  });

  it("does not query projects for an invalid session", async () => {
    const { loadCurrentAuthorizedProjectSnapshot } = await import(
      "@/lib/projects/project-snapshot"
    );

    await expect(
      loadCurrentAuthorizedProjectSnapshot("invalid-token"),
    ).resolves.toBeNull();
    expect(repository.findByEditTokenHash).not.toHaveBeenCalled();
  });

  it("keeps each authorized project once when its token is repeated", async () => {
    const { createProjectEditToken } = await import("@/lib/projects/auth");
    const { loadAuthorizedProjectSnapshots } = await import(
      "@/lib/projects/project-snapshot"
    );
    const editToken = createProjectEditToken();
    repository.findByEditTokenHash.mockResolvedValue({
      id: "project-preview",
      name: "Probability Course",
      stage: "preview",
      teachingBrief: {},
    });

    await expect(
      loadAuthorizedProjectSnapshots([editToken, editToken]),
    ).resolves.toHaveLength(1);
    expect(repository.findByEditTokenHash).toHaveBeenCalledOnce();
  });
});
