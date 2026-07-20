import { beforeEach, describe, expect, it } from "vitest";

describe("project edit tokens", () => {
  beforeEach(() => {
    process.env.PROJECT_EDIT_TOKEN_SECRET = "a-test-secret-with-at-least-32-characters";
  });

  it("creates a signed opaque token with a one-way database verifier", async () => {
    const { createProjectEditToken, hashProjectEditToken, verifyProjectEditToken } =
      await import("@/lib/projects/auth");
    const token = createProjectEditToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(hashProjectEditToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProjectEditToken(token)).not.toContain(token);
    expect(verifyProjectEditToken(token)).toBe(true);
    expect(verifyProjectEditToken(`${token}tampered`)).toBe(false);
  });

  it("prefers the project-specific edit session and keeps each project token", async () => {
    const {
      getProjectEditToken,
      getProjectEditTokens,
      projectEditCookieName,
    } = await import("@/lib/projects/auth");
    const projectId = "project-preview";
    const request = new Request("http://localhost/projects/project-preview", {
      headers: {
        cookie: [
          "tutorlab_project_edit=legacy-token",
          `${projectEditCookieName(projectId)}=project-token`,
        ].join("; "),
      },
    });

    expect(getProjectEditToken(request, projectId)).toBe("project-token");
    expect(getProjectEditTokens([
      { name: "tutorlab_project_edit", value: "legacy-token" },
      { name: projectEditCookieName(projectId), value: "project-token" },
      { name: projectEditCookieName(projectId), value: "project-token" },
    ])).toEqual(["legacy-token", "project-token"]);
  });
});
