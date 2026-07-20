import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeachingBriefWizard } from "@/components/projects/teaching-brief-wizard";

const project = {
  id: "project-alpha",
  name: "Probability tutor",
  stage: "brief" as const,
  teachingBrief: {},
};

function completeContext() {
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Mathematics" },
  });
  fireEvent.change(screen.getByLabelText("Main topic"), {
    target: { value: "Probability" },
  });
  fireEvent.change(screen.getByLabelText("Student level"), {
    target: { value: "First year" },
  });
  fireEvent.change(screen.getByLabelText("Teaching language"), {
    target: { value: "English" },
  });
}

describe("TeachingBriefWizard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("validates each step before allowing the educator to continue", () => {
    render(<TeachingBriefWizard project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Add your subject before continuing.")).toBeInTheDocument();

    completeContext();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByRole("heading", { name: "What is this tutor for?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("supports Back, Next, and radio keyboard interaction with visible focus", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<TeachingBriefWizard project={project} />);

    completeContext();
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    expect(next).toHaveFocus();
    await user.keyboard("{Enter}");
    const guidedPractice = screen.getByRole("radio", {
      name: "Guide practice without taking over",
    });
    guidedPractice.focus();
    expect(guidedPractice).toHaveFocus();

    await user.keyboard(" ");
    expect(guidedPractice).toBeChecked();

    const back = screen.getByRole("button", { name: "Back" });
    back.focus();
    expect(back).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Tell us about your teaching context" }),
    ).toBeInTheDocument();
  });

  it("autosaves a valid change and announces its saved state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<TeachingBriefWizard project={project} />);

    completeContext();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/projects/project-alpha/brief");
    expect(request.method).toBe("PATCH");
    expect(request.credentials).toBe("same-origin");
    expect(request.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(request.body as string)).toEqual({
      context: {
        subject: "Mathematics",
        topic: "Probability",
        studentLevel: "First year",
        language: "English",
      },
    });
  });

  it("keeps a browser draft after a failed save and recovers it on return", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
    );
    const view = render(<TeachingBriefWizard project={project} />);

    completeContext();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByRole("status")).toHaveTextContent("stored in this browser");
    expect(localStorage.getItem("tutorlab:teaching-brief:project-alpha")).toContain(
      "Mathematics",
    );

    view.unmount();
    render(<TeachingBriefWizard project={project} />);

    expect(screen.getByText(/Recovered locally/)).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("Mathematics");
  });

  it("ignores a stale failed save while a newer revision is queued", async () => {
    let rejectFirst: (reason?: unknown) => void = () => undefined;
    let resolveSecond: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeachingBriefWizard project={project} />);

    completeContext();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Statistics" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    rejectFirst(new Error("Network down"));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("status")).not.toHaveTextContent("Couldn't save");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: expect.stringContaining("Statistics"),
    });

    resolveSecond(new Response(JSON.stringify({ project }), { status: 200 }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(localStorage.getItem("tutorlab:teaching-brief:project-alpha")).toBeNull();
  });

  it("recovers from a malformed successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ project: {} }))),
    );
    render(<TeachingBriefWizard project={project} />);

    completeContext();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(screen.getByRole("status")).toHaveTextContent("stored in this browser");
    expect(localStorage.getItem("tutorlab:teaching-brief:project-alpha")).toContain("Mathematics");
  });
});
