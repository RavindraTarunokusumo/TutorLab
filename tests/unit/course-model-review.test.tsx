import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import courseModel from "../../fixtures/probability-course/course-model.json";
import { CourseModelReview } from "@/components/course-model/course-model-review";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "course-model-version-1",
    projectId: "project-probability",
    version: 1,
    artifact: courseModel,
    teacherEdited: false,
    createdAt: "2026-07-15T10:05:00.000Z",
    ...overrides,
  };
}

function readySource() {
  return {
    id: "source-probability",
    projectId: "project-empty",
    name: "probability-notes.pdf",
    role: "lecture",
    authority: "course_authoritative",
    permissions: {
      useForCourseModel: true,
      useForPedagogyDrafting: true,
      useForRuntimeRetrieval: false,
      useForEvaluation: true,
      revealExcerptsToStudents: false,
    },
    containsProtectedSolutions: false,
    contentHash: "a".repeat(64),
    mimeType: "application/pdf",
    sizeBytes: 1024,
    processing: {
      uploadStatus: "ready",
      extractionStatus: "ready",
      analysisStatus: "ready",
      pageCount: 1,
      extractedTokenCount: 10,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CourseModelReview", () => {
  it("loads navigable compact findings and shows source metadata without source passages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ version: version() })));
    const user = userEvent.setup();

    render(<CourseModelReview projectId="project-probability" />);

    expect(await screen.findByRole("heading", { name: "Introductory Probability" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Independence" }));
    expect(screen.getByRole("heading", { name: "Concept" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View 2 source references" }));

    expect(screen.getByRole("dialog", { name: "Source reference" })).toBeInTheDocument();
    expect(screen.getByText("practice-exercises.pdf")).toBeInTheDocument();
    expect(screen.getByText("Exercise 4")).toBeInTheDocument();
    expect(screen.getByText(/no source passage is shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/full worked solution text/i)).not.toBeInTheDocument();
  });

  it("saves an allowed teacher correction as a version-aware PATCH revision", async () => {
    const revisedArtifact = {
      ...courseModel,
      version: 2,
      concepts: courseModel.concepts.map((concept) =>
        concept.id === "concept-independence"
          ? { ...concept, description: "Teacher-approved wording." }
          : concept,
      ),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ version: version() }))
      .mockResolvedValueOnce(json({ version: version({ version: 2, artifact: revisedArtifact, teacherEdited: true }) }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CourseModelReview projectId="project-probability" />);
    await screen.findByRole("heading", { name: "Introductory Probability" });
    await user.click(screen.getByRole("button", { name: "Independence" }));
    const description = screen.getByLabelText("Description");
    fireEvent.change(description, { target: { value: "Teacher-approved wording." } });
    await user.click(screen.getByRole("button", { name: "Save teacher revision" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/projects/project-probability/course-model");
    expect(init).toMatchObject({ method: "PATCH", credentials: "same-origin" });
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: "0.1",
      projectId: "project-probability",
      baseVersion: 1,
      operations: [{
        operation: "update_concept",
        id: "concept-independence",
        name: "Independence",
        description: "Teacher-approved wording.",
      }],
    });
    expect(await screen.findByText("Saved as immutable version 2.")).toBeInTheDocument();
  });

  it("communicates absent and partial model states without substituting fixture data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: "Not found" }, 404))
      .mockResolvedValueOnce(json({ sources: [] }))
      .mockResolvedValueOnce(json({
        version: version({
          artifact: {
            ...courseModel,
            coverage: {
              ...courseModel.coverage,
              analyzedCount: 2,
              failedCount: 1,
              analysisCompleteness: "partial",
            },
          },
        }),
      }));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<CourseModelReview projectId="project-empty" />);
    expect(await screen.findByRole("heading", { name: "Create course model" })).toBeInTheDocument();
    expect(screen.queryByText("Introductory Probability")).not.toBeInTheDocument();

    view.unmount();
    render(<CourseModelReview projectId="project-probability" />);
    expect(await screen.findByText(/Reviewing a partial model/i)).toBeInTheDocument();
  });

  it("generates the first model only from the empty course-model page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: "Not found" }, 404))
      .mockResolvedValueOnce(json({ sources: [readySource()] }))
      .mockResolvedValueOnce(json({ version: version() }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CourseModelReview projectId="project-empty" />);
    await screen.findByRole("heading", { name: "Create course model" });
    await user.click(screen.getByRole("button", { name: "Generate course model" }));

    expect(await screen.findByRole("heading", { name: "Introductory Probability" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/projects/project-empty/synthesize");
  });

  it("marks only fields with a matching immutable teacher decision", async () => {
    const editedModel = {
      ...courseModel,
      teacherDecisions: [
        { id: "decision-concept", fieldPath: "/update_concept/concept-independence", decision: "Teacher corrected this concept.", decidedAt: "2026-07-15T12:00:00.000Z" },
        { id: "decision-objective", fieldPath: "/update_learning_objective/objective-distinguish-events", decision: "Teacher approved this objective.", decidedAt: "2026-07-15T12:00:00.000Z" },
        { id: "decision-misconception", fieldPath: "/update_misconception/misconception-exclusive-independent", decision: "Teacher clarified this misconception.", decidedAt: "2026-07-15T12:00:00.000Z" },
        { id: "decision-observation", fieldPath: "/update_pedagogical_observation_status/observation-reasoning-first", decision: "Teacher confirmed this observation.", decidedAt: "2026-07-15T12:00:00.000Z" },
        { id: "decision-disclosure", fieldPath: "/update_disclosure_label/solution-exam-1", decision: "Teacher set this disclosure policy.", decidedAt: "2026-07-15T12:00:00.000Z" },
        { id: "decision-unrelated", fieldPath: "/update_concept/concept-not-present", decision: "Not displayed.", decidedAt: "2026-07-15T12:00:00.000Z" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ version: version({ artifact: editedModel, teacherEdited: true }) })));
    const user = userEvent.setup();

    render(<CourseModelReview projectId="project-probability" />);
    await screen.findByRole("heading", { name: "Introductory Probability" });
    await user.click(screen.getByRole("button", { name: "Independence" }));
    expect(screen.getAllByText("Teacher edited")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Distinguish mutually exclusive events/i }));
    expect(screen.getAllByText("Teacher edited")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Mutually exclusive events are independent/i }));
    expect(screen.getAllByText("Teacher edited")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "reasoning before calculation" }));
    expect(screen.getAllByText("Teacher edited")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Protected reasoning and final result/i }));
    expect(screen.getAllByText("Teacher edited")).toHaveLength(1);
  });

  it("resets the new project after a stale in-flight save", async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => { resolveSave = resolve; });
    const betaArtifact = { ...courseModel, projectId: "project-beta", courseIdentity: { ...courseModel.courseIdentity, title: "Beta probability" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ version: version() }))
      .mockImplementationOnce(() => pendingSave)
      .mockResolvedValueOnce(json({ version: version({ projectId: "project-beta", artifact: betaArtifact }) }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const view = render(<CourseModelReview projectId="project-probability" />);
    await screen.findByRole("heading", { name: "Introductory Probability" });
    await user.click(screen.getByRole("button", { name: "Independence" }));
    await user.click(screen.getByRole("button", { name: "Save teacher revision" }));

    view.rerender(<CourseModelReview projectId="project-beta" />);
    expect(await screen.findByRole("heading", { name: "Beta probability" })).toBeInTheDocument();
    resolveSave?.(json({ version: version({ version: 2 }) }, 201));
  });
});
