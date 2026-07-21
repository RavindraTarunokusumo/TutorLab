import { describe, expect, it, vi } from "vitest";
import { saveBriefPatch } from "@/lib/projects/brief-client";

describe("saveBriefPatch", () => {
  it("uses the authorized same-origin brief PATCH contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: "project-alpha",
            name: "Probability tutor",
            stage: "brief",
            teachingBrief: { purpose: "guided_practice" },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveBriefPatch("project-alpha", {
      context: {
        subject: " Mathematics ",
        topic: "Probability",
        studentLevel: "First year",
        language: "English",
      },
    })).resolves.toMatchObject({ id: "project-alpha" });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-alpha/brief", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          subject: "mathematics",
          topic: "statistics-probability",
          studentLevel: "undergraduate",
          language: "en",
        },
      }),
    });
  });

  it("treats malformed successful responses as a save failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ project: {} }))),
    );

    await expect(
      saveBriefPatch("project-alpha", { purpose: "guided_practice" }),
    ).rejects.toThrow("Invalid teaching brief response");
  });

  it("rejects snapshots with a non-canonical teaching brief", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        project: {
          id: "project-alpha",
          name: "Probability tutor",
          stage: "brief",
          teachingBrief: null,
        },
      }))),
    );

    await expect(
      saveBriefPatch("project-alpha", { purpose: "guided_practice" }),
    ).rejects.toThrow("Invalid teaching brief response");
  });
});
