// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const testKey = "sk-test-session-key-that-is-long-enough";

describe("private OpenAI key sessions", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  });

  it("keeps the key server-side behind an opaque session cookie", async () => {
    const { createOpenAIKeySession, getSessionOpenAIKey, OPENAI_KEY_COOKIE } =
      await import("@/lib/ai/session-key");
    const sessionId = createOpenAIKeySession(testKey);
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: `${OPENAI_KEY_COOKIE}=${sessionId}` },
    });

    expect(sessionId).not.toContain(testKey);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(getSessionOpenAIKey(request)).toBe(testKey);
  });

  it("exposes the key only inside its originating async request scope", async () => {
    const {
      createOpenAIKeySession,
      getRequestOpenAIKey,
      OPENAI_KEY_COOKIE,
      withOpenAIRequestKey,
    } = await import("@/lib/ai/session-key");
    const sessionId = createOpenAIKeySession(testKey);
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: `${OPENAI_KEY_COOKIE}=${sessionId}` },
    });

    const response = await withOpenAIRequestKey(request, async () => {
      expect(getRequestOpenAIKey()).toBe(testKey);
      return Response.json({ ok: true });
    });

    expect(response.status).toBe(200);
    expect(getRequestOpenAIKey()).toBeUndefined();
  });

  it("rejects OpenAI work when neither environment nor session key exists", async () => {
    const { withOpenAIRequestKey } = await import("@/lib/ai/session-key");
    const response = await withOpenAIRequestKey(
      new Request("http://localhost/api/test"),
      async () => Response.json({ ok: true }),
    );

    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({
      code: "OPENAI_API_KEY_REQUIRED",
    });
  });
});
