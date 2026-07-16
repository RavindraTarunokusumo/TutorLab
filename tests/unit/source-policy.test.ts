import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_WORKSPACE_BUDGET, type SourcePermissions } from "@/lib/schemas";
import {
  EMPTY_WORKSPACE_USAGE,
  addWorkspaceBudgetDelta,
  createSourceMetadata,
  evaluateWorkspaceBudget,
  hashSourceContent,
  SourceValidationError,
  validateSourceCandidate,
  type SourceCandidate,
  type WorkspaceBudgetUsage,
} from "@/lib/sources";

const permissions: SourcePermissions = {
  useForCourseModel: true,
  useForPedagogyDrafting: true,
  useForRuntimeRetrieval: false,
  useForEvaluation: true,
  revealExcerptsToStudents: false,
};

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    name: "course-notes.md",
    mimeType: "text/markdown",
    sizeBytes: 10,
    role: "lecture",
    authority: "course_authoritative",
    permissions,
    containsProtectedSolutions: false,
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

function usage(overrides: Partial<WorkspaceBudgetUsage> = {}): WorkspaceBudgetUsage {
  return { ...EMPTY_WORKSPACE_USAGE, ...overrides };
}

describe("source ingestion policy", () => {
  it.each([
    [
      "the file-count cap",
      usage({ fileCount: DEFAULT_WORKSPACE_BUDGET.maxFiles - 1 }),
      candidate(),
      "SOURCE_VALID",
    ],
    [
      "one source beyond the file-count cap",
      usage({ fileCount: DEFAULT_WORKSPACE_BUDGET.maxFiles }),
      candidate(),
      "FILE_COUNT_LIMIT_EXCEEDED",
    ],
    [
      "the per-file byte cap",
      usage(),
      candidate({ sizeBytes: DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile }),
      "SOURCE_VALID",
    ],
    [
      "one byte beyond the per-file cap",
      usage(),
      candidate({ sizeBytes: DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile + 1 }),
      "FILE_SIZE_LIMIT_EXCEEDED",
    ],
    [
      "the workspace byte cap",
      usage({ workspaceBytes: DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes - 10 }),
      candidate({ sizeBytes: 10 }),
      "SOURCE_VALID",
    ],
    [
      "one byte beyond the workspace cap",
      usage({ workspaceBytes: DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes - 10 }),
      candidate({ sizeBytes: 11 }),
      "WORKSPACE_BYTES_LIMIT_EXCEEDED",
    ],
    [
      "the page cap",
      usage({ pageCount: DEFAULT_WORKSPACE_BUDGET.maxPages - 1 }),
      candidate({ pageCount: 1 }),
      "SOURCE_VALID",
    ],
    [
      "one page beyond the page cap",
      usage({ pageCount: DEFAULT_WORKSPACE_BUDGET.maxPages }),
      candidate({ pageCount: 1 }),
      "PAGE_LIMIT_EXCEEDED",
    ],
    [
      "the extracted-token cap",
      usage({ extractedTokenCount: DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens - 1 }),
      candidate({ extractedTokenCount: 1 }),
      "SOURCE_VALID",
    ],
    [
      "one token beyond the extracted-token cap",
      usage({ extractedTokenCount: DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens }),
      candidate({ extractedTokenCount: 1 }),
      "EXTRACTED_TOKEN_LIMIT_EXCEEDED",
    ],
  ])("accepts or rejects %s deterministically", (_case, current, source, code) => {
    expect(validateSourceCandidate(source, current).code).toBe(code);
  });

  it("rejects deferred tutor traces, absent authority, and incomplete permissions", () => {
    expect(validateSourceCandidate(candidate({ role: "tutor_trace" }), usage()).code).toBe(
      "SOURCE_ROLE_UNSUPPORTED",
    );
    expect(validateSourceCandidate(candidate({ authority: "" }), usage()).code).toBe(
      "SOURCE_AUTHORITY_REQUIRED",
    );
    expect(
      validateSourceCandidate(
        candidate({ permissions: { useForCourseModel: true } as SourcePermissions }),
        usage(),
      ).code,
    ).toBe("SOURCE_PERMISSIONS_REQUIRED");
  });

  it("rejects protected sources with student retrieval or excerpt permissions", () => {
    expect(
      validateSourceCandidate(
        candidate({
          containsProtectedSolutions: true,
          permissions: { ...permissions, useForRuntimeRetrieval: true },
        }),
        usage(),
      ).code,
    ).toBe("PROTECTED_SOURCE_PERMISSION_DENIED");
    expect(
      validateSourceCandidate(
        candidate({
          containsProtectedSolutions: true,
          permissions: { ...permissions, revealExcerptsToStudents: true },
        }),
        usage(),
      ).code,
    ).toBe("PROTECTED_SOURCE_PERMISSION_DENIED");
  });

  it("detects duplicate hashes without including source content in the safe result", () => {
    const source = candidate({ contentHash: hashSourceContent(new TextEncoder().encode("private answer")) });
    const result = validateSourceCandidate(
      source,
      usage({ contentHashes: [source.contentHash] }),
    );

    expect(result).toEqual({
      valid: false,
      code: "DUPLICATE_SOURCE_CONTENT",
      message: "This file has already been added to this workspace.",
    });
    expect(JSON.stringify(result)).not.toContain("private answer");
  });

  it("hashes original bytes server-side and initializes unknown metrics for a later hard check", async () => {
    const bytes = new TextEncoder().encode("private course content");
    const source = await createSourceMetadata({
      id: "document-course-notes",
      projectId: "project-alpha",
      bytes,
      usage: usage(),
      name: "course-notes.md",
      mimeType: "text/markdown",
      role: "lecture",
      authority: "course_authoritative",
      permissions,
      containsProtectedSolutions: false,
    });

    expect(source.contentHash).toBe(hashSourceContent(bytes));
    expect(source.sizeBytes).toBe(bytes.byteLength);
    expect(source.processing).not.toHaveProperty("pageCount");
    expect(source.processing).not.toHaveProperty("extractedTokenCount");
  });

  it("does not let unknown pages or tokens bypass the later hard check", () => {
    const accepted = validateSourceCandidate(candidate(), usage());
    expect(accepted.valid).toBe(true);
    if (accepted.valid) {
      expect(accepted.budget.usage).toMatchObject({
        unknownPageCount: 1,
        unknownExtractedTokenCount: 1,
      });
    }

    expect(
      evaluateWorkspaceBudget(
        usage({ pageCount: DEFAULT_WORKSPACE_BUDGET.maxPages }),
        { pageCount: 1 },
      ).code,
    ).toBe("PAGE_LIMIT_EXCEEDED");
    expect(
      evaluateWorkspaceBudget(
        usage({ extractedTokenCount: DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens }),
        { extractedTokenCount: 1 },
      ).code,
    ).toBe("EXTRACTED_TOKEN_LIMIT_EXCEEDED");
  });

  it("adds every aggregate dimension without changing known duplicate hashes", () => {
    expect(
      addWorkspaceBudgetDelta(
        usage({
          fileCount: 3,
          workspaceBytes: 10,
          pageCount: 4,
          extractedTokenCount: 5,
          contentHashes: ["a".repeat(64)],
        }),
        {
          fileCount: 1,
          workspaceBytes: 2,
          pageCount: 3,
          extractedTokenCount: 4,
          unknownPageCount: 1,
          unknownExtractedTokenCount: 1,
        },
      ),
    ).toEqual({
      fileCount: 4,
      workspaceBytes: 12,
      pageCount: 7,
      extractedTokenCount: 9,
      unknownPageCount: 1,
      unknownExtractedTokenCount: 1,
      contentHashes: ["a".repeat(64)],
    });
  });

  it("throws only a safe policy error from metadata creation", async () => {
    await expect(
      createSourceMetadata({
        id: "document-course-notes",
        projectId: "project-alpha",
        bytes: new TextEncoder().encode("secret"),
        usage: usage(),
        name: "course-notes.md",
        mimeType: "text/markdown",
        role: "tutor_trace",
        authority: "course_authoritative",
        permissions,
        containsProtectedSolutions: false,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "SOURCE_ROLE_UNSUPPORTED",
        safeMessage: "This source role is not supported.",
      } satisfies Partial<SourceValidationError>),
    );
  });
});
