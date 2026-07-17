// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({
  getOpenAIClient: () => ({ responses: { create: provider.create } }),
}));
vi.mock("@/lib/fixture-runtime", () => ({
  isFixtureRuntime: () => false,
  getFixtureTutorArchitect: () => { throw new Error("fixture adapter not expected"); },
}));

const input = {
  projectId: "project-alpha",
  courseModelVersionId: "course-version-alpha",
  courseModel: {} as never,
  teachingBrief: {} as never,
  designSetId: "design-set-alpha",
  generatedAt: "2026-07-16T12:00:00.000Z",
};

describe("live tutor architect adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses structured output and makes one explicit repair request after malformed JSON", async () => {
    provider.create
      .mockResolvedValueOnce({ output_text: "{" })
      .mockResolvedValueOnce({ output_text: '{"repaired":true}' });
    const { getTutorArchitect } = await import("@/lib/ai/tutor-architect");
    const adapter = getTutorArchitect();

    await expect(adapter.generate(input)).rejects.toBeInstanceOf(SyntaxError);
    await expect(adapter.repair(input, { malformedStructuredOutput: true }))
      .resolves.toEqual({ repaired: true });

    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(provider.create.mock.calls[0]?.[0]).toMatchObject({
      text: { format: { type: "json_schema", name: "tutor_design_set", strict: true } },
    });
    expect(provider.create.mock.calls[1]?.[0].input).toContain(
      "Previous invalid output",
    );
  });
});
