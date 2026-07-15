import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prismaInstance = { service: "database" };
  const openAIInstance = { service: "openai" };

  return {
    openAIInstance,
    openAIConstructor: vi.fn(function OpenAIMock() {
      return openAIInstance;
    }),
    prismaInstance,
    prismaClientConstructor: vi.fn(function PrismaClientMock() {
      return prismaInstance;
    }),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@prisma/client", () => ({
  PrismaClient: mocks.prismaClientConstructor,
}));
vi.mock("openai", () => ({ default: mocks.openAIConstructor }));

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalOpenAIKey = process.env.OPENAI_API_KEY;

function restoreEnvironment() {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalOpenAIKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
}

describe("service client initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { tutorLabDb?: unknown }).tutorLabDb;
  });

  afterEach(restoreEnvironment);

  it("imports client modules without constructing either client", async () => {
    await Promise.all([import("@/lib/db"), import("@/lib/ai/client")]);

    expect(mocks.prismaClientConstructor).not.toHaveBeenCalled();
    expect(mocks.openAIConstructor).not.toHaveBeenCalled();
  });

  it("validates the database URL and returns one database client", async () => {
    const databaseUrl =
      "postgresql://tutorlab:tutorlab@localhost:5432/tutorlab";
    process.env.DATABASE_URL = databaseUrl;
    delete process.env.OPENAI_API_KEY;
    const { getDb } = await import("@/lib/db");

    const firstClient = getDb();
    const secondClient = getDb();

    expect(firstClient).toBe(secondClient);
    expect(mocks.prismaClientConstructor).toHaveBeenCalledOnce();
    expect(mocks.prismaClientConstructor).toHaveBeenCalledWith({
      datasources: { db: { url: databaseUrl } },
    });
  });

  it("rejects an invalid database URL before constructing a client", async () => {
    process.env.DATABASE_URL = "not-a-database-url";
    delete process.env.OPENAI_API_KEY;
    const { getDb } = await import("@/lib/db");

    expect(() => getDb()).toThrow();
    expect(mocks.prismaClientConstructor).not.toHaveBeenCalled();
  });

  it("returns one OpenAI client without requiring database configuration", async () => {
    delete process.env.DATABASE_URL;
    process.env.OPENAI_API_KEY = "unit-test-api-key";
    const { getOpenAIClient } = await import("@/lib/ai/client");

    const firstClient = getOpenAIClient();
    const secondClient = getOpenAIClient();

    expect(firstClient).toBe(secondClient);
    expect(mocks.openAIConstructor).toHaveBeenCalledOnce();
    expect(mocks.openAIConstructor).toHaveBeenCalledWith({
      apiKey: "unit-test-api-key",
    });
  });
});
