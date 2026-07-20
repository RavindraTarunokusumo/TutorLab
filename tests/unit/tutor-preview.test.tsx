import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TutorPreview } from "@/components/chat/tutor-preview";

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

const conversation = {
  schemaVersion: "0.1" as const,
  id: "conversation-preview",
  projectId: "project-preview",
  tutorVersionId: "tutor-preview",
  mode: "teacher_preview" as const,
  currentState: "diagnose" as const,
  messages: [],
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TutorPreview", () => {
  it("shows the learner message before completing a streamed rich-text tutor response", async () => {
    const encoder = new TextEncoder();
    let finish!: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Compare **both** rules: $P(A)$."}\n\n'));
        finish = () => {
          controller.enqueue(encoder.encode('event: final\ndata: {"conversationId":"conversation-preview","metadata":{"schemaVersion":"0.1","teachingMove":"give_conceptual_hint","currentState":"diagnose","nextState":"hint_1","citations":[],"boundary":"none","stateFallback":{"applied":false},"usage":{"inputTokens":0,"outputTokens":0,"latencyMs":0}}}\n\n'));
          controller.close();
        };
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ conversation }))
      .mockResolvedValueOnce(new Response(stream));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const view = render(<TutorPreview projectId="project-preview" tutorVersionId="tutor-preview" />);
    await screen.findByText("Ask a course question to begin.");
    await user.type(screen.getByLabelText("Message"), "Are mutually exclusive events independent?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getAllByText("Are mutually exclusive events independent?")).toHaveLength(1);
    await waitFor(() => expect(screen.getByText(/Compare/)).toBeInTheDocument());
    expect(view.container.querySelector(".katex")).toBeTruthy();

    finish();
    await waitFor(() => expect(screen.getByText((_content, element) => element?.tagName === "P" && element.textContent?.includes("Compare both rules") === true)).toBeInTheDocument());
    expect(screen.getByText("Tutor Inspector")).toBeInTheDocument();
  });

  it("shows normalized details for every completed tutor reply without fallback diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      conversation: {
        ...conversation,
        messages: [
          { id: "learner-1", role: "learner", content: "Help me start.", createdAt: "2026-07-19T10:01:00.000Z" },
          { id: "tutor-1", role: "tutor", content: "Start by naming the events.", createdAt: "2026-07-19T10:01:01.000Z", metadata: { schemaVersion: "0.1", teachingMove: "explain_concept", currentState: "diagnose", nextState: "explain", citations: [{ documentId: "lecture-2", title: "Conditional Probability" }], boundary: "none", stateFallback: { applied: true, reason: "transition_not_in_spec_graph" }, usage: { inputTokens: 0, outputTokens: 0, latencyMs: 10 } } },
          { id: "learner-2", role: "learner", content: "Can I have a hint?", createdAt: "2026-07-19T10:02:00.000Z" },
          { id: "tutor-2", role: "tutor", content: "Compare the intersection first.", createdAt: "2026-07-19T10:02:01.000Z", metadata: { schemaVersion: "0.1", teachingMove: "give_conceptual_hint", currentState: "explain", nextState: "check_understanding", citations: [], boundary: "none", stateFallback: { applied: false }, usage: { inputTokens: 0, outputTokens: 0, latencyMs: 12 } } },
        ],
      },
    })));

    render(<TutorPreview projectId="project-preview" tutorVersionId="tutor-preview" />);

    expect(await screen.findByText("Tutor Reply 1")).toBeInTheDocument();
    expect(screen.getByText("Tutor Reply 2")).toBeInTheDocument();
    expect(screen.getByText("Explain Concept")).toBeInTheDocument();
    expect(screen.getByText("Diagnose → Explain")).toBeInTheDocument();
    expect(screen.getByText("Conditional Probability")).toBeInTheDocument();
    expect(screen.queryByText("Safety fallback")).not.toBeInTheDocument();
    expect(screen.queryByText("transition_not_in_spec_graph")).not.toBeInTheDocument();
  });
});
