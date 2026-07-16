import {
  DEFAULT_WORKSPACE_BUDGET,
  type WorkspaceBudget,
} from "@/lib/schemas";

export type WorkspaceBudgetUsage = {
  fileCount: number;
  workspaceBytes: number;
  pageCount: number;
  extractedTokenCount: number;
  unknownPageCount: number;
  unknownExtractedTokenCount: number;
  contentHashes: readonly string[];
};

export type WorkspaceBudgetDelta = {
  fileCount?: number;
  workspaceBytes?: number;
  pageCount?: number;
  extractedTokenCount?: number;
  unknownPageCount?: number;
  unknownExtractedTokenCount?: number;
};

export type BudgetLimitCode =
  | "FILE_COUNT_LIMIT_EXCEEDED"
  | "WORKSPACE_BYTES_LIMIT_EXCEEDED"
  | "PAGE_LIMIT_EXCEEDED"
  | "EXTRACTED_TOKEN_LIMIT_EXCEEDED";

export type BudgetDecision =
  | {
      allowed: true;
      code: "BUDGET_OK";
      message: string;
      usage: WorkspaceBudgetUsage;
    }
  | {
      allowed: false;
      code: BudgetLimitCode;
      message: string;
      usage: WorkspaceBudgetUsage;
    };

const safeMessages: Record<BudgetLimitCode | "BUDGET_OK", string> = {
  BUDGET_OK: "The source fits within this workspace's limits.",
  FILE_COUNT_LIMIT_EXCEEDED: "This workspace cannot contain any more sources.",
  WORKSPACE_BYTES_LIMIT_EXCEEDED:
    "This source would exceed the workspace storage limit.",
  PAGE_LIMIT_EXCEEDED: "This source would exceed the workspace page limit.",
  EXTRACTED_TOKEN_LIMIT_EXCEEDED:
    "This source would exceed the workspace extraction limit.",
};

export const EMPTY_WORKSPACE_USAGE: WorkspaceBudgetUsage = {
  fileCount: 0,
  workspaceBytes: 0,
  pageCount: 0,
  extractedTokenCount: 0,
  unknownPageCount: 0,
  unknownExtractedTokenCount: 0,
  contentHashes: [],
};

export function addWorkspaceBudgetDelta(
  usage: WorkspaceBudgetUsage,
  delta: WorkspaceBudgetDelta,
): WorkspaceBudgetUsage {
  return {
    fileCount: usage.fileCount + (delta.fileCount ?? 0),
    workspaceBytes: usage.workspaceBytes + (delta.workspaceBytes ?? 0),
    pageCount: usage.pageCount + (delta.pageCount ?? 0),
    extractedTokenCount:
      usage.extractedTokenCount + (delta.extractedTokenCount ?? 0),
    unknownPageCount: usage.unknownPageCount + (delta.unknownPageCount ?? 0),
    unknownExtractedTokenCount:
      usage.unknownExtractedTokenCount +
      (delta.unknownExtractedTokenCount ?? 0),
    contentHashes: usage.contentHashes,
  };
}

export function evaluateWorkspaceBudget(
  usage: WorkspaceBudgetUsage,
  delta: WorkspaceBudgetDelta,
  budget: WorkspaceBudget = DEFAULT_WORKSPACE_BUDGET,
): BudgetDecision {
  const nextUsage = addWorkspaceBudgetDelta(usage, delta);
  const violated =
    nextUsage.fileCount > budget.maxFiles
      ? "FILE_COUNT_LIMIT_EXCEEDED"
      : nextUsage.workspaceBytes > budget.maxWorkspaceBytes
        ? "WORKSPACE_BYTES_LIMIT_EXCEEDED"
        : nextUsage.pageCount > budget.maxPages
          ? "PAGE_LIMIT_EXCEEDED"
          : nextUsage.extractedTokenCount > budget.maxExtractedTokens
            ? "EXTRACTED_TOKEN_LIMIT_EXCEEDED"
            : undefined;

  if (violated) {
    return {
      allowed: false,
      code: violated,
      message: safeMessages[violated],
      usage: nextUsage,
    };
  }

  return {
    allowed: true,
    code: "BUDGET_OK",
    message: safeMessages.BUDGET_OK,
    usage: nextUsage,
  };
}
