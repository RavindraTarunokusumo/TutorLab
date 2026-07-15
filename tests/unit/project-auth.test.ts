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
});
