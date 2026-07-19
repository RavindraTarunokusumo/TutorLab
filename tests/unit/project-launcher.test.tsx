import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectLauncher } from "@/components/projects/fixture-project-launcher";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectLauncher", () => {
  it("asks for a key only after the server reports that none is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ configured: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ProjectLauncher fixtureMode={false} />);

    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByRole("dialog", { name: "Add your OpenAI API key" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/openai-key", {
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toHaveFocus();
  });

  it("skips the key check in fixture mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "fixture stop" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ProjectLauncher fixtureMode />);

    await user.click(
      screen.getByRole("button", { name: "Create fixture project" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
