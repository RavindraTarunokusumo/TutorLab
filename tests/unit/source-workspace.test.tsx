import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceWorkspace } from "@/components/sources/source-workspace";

const source = {
  id: "source-alpha",
  projectId: "project-alpha",
  name: "mark-scheme.pdf",
  role: "solution",
  authority: "teacher_instruction",
  permissions: {
    useForCourseModel: true,
    useForPedagogyDrafting: true,
    useForRuntimeRetrieval: false,
    useForEvaluation: true,
    revealExcerptsToStudents: false,
  },
  containsProtectedSolutions: true,
  contentHash: "a".repeat(64),
  mimeType: "application/pdf",
  sizeBytes: 2048,
  processing: {
    uploadStatus: "ready",
    extractionStatus: "ready",
    analysisStatus: "failed",
    error: "Document analysis could not be completed. Please retry.",
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function analysisJob(status: "completed" | "failed") {
  return {
    schemaVersion: "0.1",
    id: "job-alpha",
    projectId: "project-alpha",
    sourceDocumentId: "source-alpha",
    stage: "analysis",
    idempotencyKey: "analysis-source-alpha",
    status,
    attemptCount: 1,
    progress: status === "completed" ? 1 : 0.5,
    completedAt: "2026-07-15T12:00:00.000Z",
    ...(status === "failed"
      ? {
          diagnostic: {
            code: "analysis_failed",
            message: "Document analysis could not be completed. Please retry.",
            retryable: true,
          },
        }
      : {}),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SourceWorkspace", () => {
  it("renders protected metadata and never renders source excerpts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ sources: [source] })));

    render(<SourceWorkspace projectId="project-alpha" />);

    expect(await screen.findByText("mark-scheme.pdf")).toBeInTheDocument();
    expect(screen.getByText("Protected solutions")).toBeInTheDocument();
    expect(screen.getByText(/Student excerpts are restricted/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Choose source files")).toHaveAttribute(
      "accept",
      ".pdf,.docx,.txt,.md,.json",
    );
    expect(screen.queryByText(/worked solution body/i)).not.toBeInTheDocument();
  });

  it("uploads selected files with the chosen metadata through the authorized API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ sources: [] }))
      .mockResolvedValueOnce(json({ source }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SourceWorkspace projectId="project-alpha" />);
    await screen.findByText("No course sources yet.");
    const file = new File(["course notes"], "notes.md", {
      type: "text/markdown",
    });
    await user.upload(screen.getByLabelText("Choose source files"), file);
    await user.selectOptions(screen.getByLabelText("Material role"), "lecture");
    await user.click(screen.getByRole("button", { name: "Upload 1 file" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/projects/project-alpha/files");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    const formData = init.body as FormData;
    expect(formData.get("file")).toBe(file);
    expect(JSON.parse(String(formData.get("metadata")))).toMatchObject({
      role: "lecture",
      authority: "course_authoritative",
      containsProtectedSolutions: false,
    });
  });

  it("ignores a delayed upload result after the workspace changes", async () => {
    let resolveUpload: ((response: Response) => void) | undefined;
    const delayedUpload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const betaSource = {
      ...source,
      id: "source-beta",
      projectId: "project-beta",
      name: "beta-notes.md",
      contentHash: "d".repeat(64),
      containsProtectedSolutions: false,
      processing: {
        uploadStatus: "ready",
        extractionStatus: "ready",
        analysisStatus: "ready",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ sources: [] }))
      .mockImplementationOnce(() => delayedUpload)
      .mockResolvedValueOnce(json({ sources: [betaSource] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const view = render(<SourceWorkspace projectId="project-alpha" />);
    await screen.findByText("No course sources yet.");
    await user.upload(
      screen.getByLabelText("Choose source files"),
      new File(["course notes"], "alpha-notes.md", { type: "text/markdown" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload 1 file" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    view.rerender(<SourceWorkspace projectId="project-beta" />);
    expect(await screen.findByText("beta-notes.md")).toBeInTheDocument();
    await act(async () => resolveUpload?.(json({ source })));

    await waitFor(() => {
      expect(screen.getByText("beta-notes.md")).toBeInTheDocument();
      expect(screen.queryByText("mark-scheme.pdf")).not.toBeInTheDocument();
      expect(screen.queryByText(/Sources uploaded/i)).not.toBeInTheDocument();
    });
  });

  it("offers safe refresh and individual reanalysis for a failed source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ sources: [source] }))
      .mockResolvedValueOnce(json({ source: { ...source, processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus: "pending" } } }))
      .mockResolvedValueOnce(json({ job: analysisJob("completed") }, 202))
      .mockResolvedValueOnce(json({ sources: [{ ...source, processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus: "ready" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SourceWorkspace projectId="project-alpha" />);
    await screen.findByText("mark-scheme.pdf");
    await user.click(screen.getByRole("button", { name: "Refresh processing for mark-scheme.pdf" }));
    await user.click(screen.getByRole("button", { name: "Retry analysis for mark-scheme.pdf" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/projects/project-alpha/files/source-alpha");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/projects/project-alpha/files/source-alpha/analyze");
    expect(await screen.findByText("Analysis completed for mark-scheme.pdf.")).toBeInTheDocument();
  });

  it("reloads after a failed analysis job and communicates the safe diagnostic", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ sources: [source] }))
      .mockResolvedValueOnce(json({ job: analysisJob("failed") }, 202))
      .mockResolvedValueOnce(json({ sources: [source] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SourceWorkspace projectId="project-alpha" />);
    await screen.findByText("mark-scheme.pdf");
    await user.click(screen.getByRole("button", { name: "Retry analysis for mark-scheme.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Document analysis could not be completed. Please retry.",
    );
    expect(screen.getByText("Analysis: failed")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not allow a stale source-list response to overwrite a newer refresh", async () => {
    let resolveStale: ((response: Response) => void) | undefined;
    const staleResponse = new Promise<Response>((resolve) => {
      resolveStale = resolve;
    });
    const freshSource = {
      ...source,
      id: "source-fresh",
      name: "fresh-notes.md",
      contentHash: "b".repeat(64),
      containsProtectedSolutions: false,
      processing: {
        uploadStatus: "ready",
        extractionStatus: "ready",
        analysisStatus: "ready",
      },
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => staleResponse)
      .mockResolvedValueOnce(json({ sources: [freshSource] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SourceWorkspace projectId="project-alpha" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Refresh list" }));
    expect(await screen.findByText("fresh-notes.md")).toBeInTheDocument();
    await act(async () => resolveStale?.(json({ sources: [source] })));

    await waitFor(() => expect(screen.queryByText("mark-scheme.pdf")).not.toBeInTheDocument());
  });

  it("labels sources with pending token measurement separately from known zero tokens", async () => {
    const knownZeroSource = {
      ...source,
      id: "source-zero",
      name: "empty-outline.txt",
      contentHash: "c".repeat(64),
      containsProtectedSolutions: false,
      processing: {
        uploadStatus: "ready",
        extractionStatus: "ready",
        analysisStatus: "ready",
        extractedTokenCount: 0,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ sources: [source, knownZeroSource] })),
    );

    render(<SourceWorkspace projectId="project-alpha" />);

    expect(await screen.findByText("empty-outline.txt")).toBeInTheDocument();
    expect(screen.getByText("0 known of 1,000,000 · 1 source pending measurement")).toBeInTheDocument();
  });
});
