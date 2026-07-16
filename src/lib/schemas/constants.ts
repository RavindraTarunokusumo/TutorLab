export const SCHEMA_LIMITS = {
  id: 96,
  label: 160,
  shortText: 320,
  longText: 1_200,
  summary: 2_000,
  locator: 240,
  evidencePerItem: 8,
  findingsPerCategory: 80,
  courseItemsPerCategory: 128,
  stringListItems: 64,
  patchOperations: 50,
  courseModelSerializedCharacters: 250_000,
} as const;

export const DEFAULT_WORKSPACE_BUDGET = {
  maxFiles: 30,
  maxPages: 500,
  maxExtractedTokens: 2_000_000,
  maxBytesPerFile: 50 * 1024 * 1024,
  maxWorkspaceBytes: 200 * 1024 * 1024,
} as const;

