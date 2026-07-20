import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorDesignComparison } from "@/components/tutor-design/tutor-design-comparison";
import type { TutorDesign } from "@/lib/schemas";

const client = vi.hoisted(() => ({
  fetchTutorDesigns: vi.fn(),
  generateTutorDesignsClient: vi.fn(),
}));
const compiler = vi.hoisted(() => ({ compileTutorClient: vi.fn() }));

vi.mock("@/lib/tutor/design-client", () => client);
vi.mock("@/lib/tutor/compiler-client", () => compiler);

const baseControls = {
  diagnoseBeforeExplain: true,
  hintEscalation: "gradual",
  tone: "encouraging",
  maxWords: 160,
  offTopicHandling: "redirect",
} as const;

function design(id: string, role: TutorDesign["candidateRole"]): TutorDesign {
  return {
    id,
    archetypeId: `${id}-archetype`,
    templateVersion: "0.1",
    candidateRole: role,
    title: `Tutor ${id}`,
    strategySummary: `Strategy for ${id}.`,
    tradeOff: `Trade-off for ${id}.`,
    evidence: [{ documentId: "course-notes", excerptId: `excerpt-${id}`, locatorLabel: `Lecture ${id}` }],
    comparisonLearnerMessage: "Can you help me check my reasoning?",
    sampleResponse: "Show your method first.",
    controls: baseControls,
    permittedAssistanceStates: ["diagnose", "hint_1"],
    permittedTeachingMoves: ["elicit_reasoning", "give_conceptual_hint"],
  };
}

const designs = [
  design("alpha", "best_fit"),
  design("beta", "strong_alternative"),
  design("gamma", "balanced_option"),
];

describe("TutorDesignComparison", () => {
  beforeEach(() => {
    localStorage.clear();
    client.fetchTutorDesigns.mockResolvedValue(designs);
    client.generateTutorDesignsClient.mockReset();
    compiler.compileTutorClient.mockReset();
    compiler.compileTutorClient.mockResolvedValue({ job: {}, tutorVersion: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders a responsive comparison with recommendation, course evidence, shared prompt, trade-off, and sample response", async () => {
    render(<TutorDesignComparison projectId="project-alpha" />);

    await screen.findByRole("button", { name: "Choose Tutor alpha" });
    expect(screen.getAllByText("Can you help me check my reasoning?")).toHaveLength(1);
    expect(screen.getAllByText("Course evidence")).toHaveLength(3);
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("Strong alternative")).toBeInTheDocument();
    expect(screen.getByText("Balanced option")).toBeInTheDocument();
    expect(screen.queryByText("course-notes")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("reveals the validated controls after selection and restores that selection after refresh", async () => {
    const first = render(<TutorDesignComparison projectId="project-alpha" />);
    await userEvent.click(await screen.findByRole("button", { name: "Choose Tutor beta" }));

    expect(screen.getByRole("heading", { name: "Tailor Tutor beta" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Diagnose before explaining/ })).toBeChecked();
    expect(screen.getByLabelText("Hint progression")).toHaveValue("gradual");
    expect(screen.getByText("encouraging")).toBeInTheDocument();
    expect(screen.getByLabelText("Off-topic requests")).toHaveValue("redirect");
    expect(screen.getByLabelText("Maximum words per reply")).toHaveValue("160");
    expect(screen.getByRole("button", { name: "Compile tutor" })).toBeEnabled();

    first.unmount();
    render(<TutorDesignComparison projectId="project-alpha" />);

    await screen.findByRole("heading", { name: "Tailor Tutor beta" });
    expect(screen.getByRole("button", { name: "Selected" })).toHaveAccessibleName("Selected");
  });

  it("passes the selected design controls to the compiler hook", async () => {
    const onCompile = vi.fn().mockResolvedValue(undefined);
    render(<TutorDesignComparison projectId="project-alpha" onCompile={onCompile} />);

    await userEvent.click(await screen.findByRole("button", { name: "Choose Tutor alpha" }));
    fireEvent.change(screen.getByLabelText("Maximum words per reply"), { target: { value: "240" } });
    await userEvent.click(screen.getByRole("button", { name: "Compile tutor" }));

    await waitFor(() => expect(onCompile).toHaveBeenCalledWith({
      designId: "alpha",
      overrides: expect.objectContaining({ maxWords: 240 }),
    }));
  });

  it("gives an accessible retry state without exposing response internals", async () => {
    client.fetchTutorDesigns.mockRejectedValue(new Error("provider response with secret content"));
    render(<TutorDesignComparison projectId="project-alpha" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tutor designs could not be loaded. Try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("provider response");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(client.fetchTutorDesigns).toHaveBeenCalledTimes(2);
  });

  it("keeps generated designs when the initial load resolves afterwards", async () => {
    let resolveInitialLoad: (value: TutorDesign[]) => void = () => undefined;
    client.fetchTutorDesigns.mockImplementationOnce(() => new Promise<TutorDesign[]>((resolve) => {
      resolveInitialLoad = resolve;
    }));
    client.generateTutorDesignsClient.mockResolvedValue({ designs });
    render(<TutorDesignComparison projectId="project-alpha" />);

    await userEvent.click(screen.getByRole("button", { name: "Create tutor designs" }));
    await screen.findByRole("button", { name: "Choose Tutor alpha" });
    resolveInitialLoad([design("stale", "best_fit")]);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Choose Tutor stale" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Choose Tutor alpha" })).toBeInTheDocument();
  });
});
