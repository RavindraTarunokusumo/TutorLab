// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const testKey = "sk-test-route-key-that-is-long-enough";

describe("OpenAI key session API", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    globalThis.tutorLabOpenAIKeySessions?.clear();
    globalThis.tutorLabOpenAIKeyEnrollmentWindow = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  });

  it("reports missing configuration without exposing credential material", async () => {
    const { GET } = await import("@/app/api/openai-key/route");
    const response = await GET(new Request("http://localhost/api/openai-key"));

    expect(await response.json()).toEqual({ configured: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("stores only an opaque HttpOnly session identifier in the browser", async () => {
    const { GET, POST } = await import("@/app/api/openai-key/route");
    const created = await POST(
      new Request("http://localhost/api/openai-key", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ apiKey: testKey }),
      }),
    );
    const cookie = created.headers.get("set-cookie");

    expect(created.status).toBe(200);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).not.toContain(testKey);
    expect(cookie).not.toContain("Max-Age");

    const status = await GET(
      new Request("http://localhost/api/openai-key", {
        headers: { cookie: cookie!.split(";")[0] },
      }),
    );
    expect(await status.json()).toEqual({ configured: true });
  });

  it("rejects cross-origin key submission", async () => {
    const { POST } = await import("@/app/api/openai-key/route");
    const response = await POST(
      new Request("http://localhost/api/openai-key", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ apiKey: testKey }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects credential enrollment without a browser origin", async () => {
    const { POST } = await import("@/app/api/openai-key/route");
    const response = await POST(
      new Request("http://localhost/api/openai-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: testKey }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("enforces the process-wide enrollment budget", async () => {
    const { POST } = await import("@/app/api/openai-key/route");
    const enroll = () =>
      POST(
        new Request("http://localhost/api/openai-key", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({ apiKey: testKey }),
        }),
      );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await enroll()).status).toBe(200);
    }
    const limited = await enroll();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
  });

  it("fails closed in production without the single-instance opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TUTORLAB_IN_MEMORY_OPENAI_KEY_SESSIONS", "0");
    const { POST } = await import("@/app/api/openai-key/route");
    const response = await POST(
      new Request("https://tutorlab.example/api/openai-key", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://tutorlab.example",
        },
        body: JSON.stringify({ apiKey: testKey }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    vi.unstubAllEnvs();
  });
});
