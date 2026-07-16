import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env-schema";

describe("parseServerEnv", () => {
  it("accepts the required server configuration", () => {
    expect(
      parseServerEnv({
        DATABASE_URL: "postgresql://tutorlab:tutorlab@localhost:5432/tutorlab",
        OPENAI_API_KEY: "test-api-key",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://tutorlab:tutorlab@localhost:5432/tutorlab",
      OPENAI_API_KEY: "test-api-key",
    });
  });

  it("rejects missing secrets without including configured values in errors", () => {
    let error: unknown;

    try {
      parseServerEnv({
        DATABASE_URL: "not-a-database-url",
        OPENAI_API_KEY: "",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeDefined();
    expect(String(error)).not.toContain("not-a-database-url");
  });
});
