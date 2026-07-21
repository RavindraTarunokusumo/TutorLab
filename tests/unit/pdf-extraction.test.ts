import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractPdfText } from "@/lib/sources/pdf-extraction";
import {
  extractedPageCountFromContent,
  extractedTokenCountFromContent,
} from "@/lib/sources/extraction-metrics";

describe("PDF extraction", () => {
  it("extracts text and per-page boundaries for a multi-page PDF", async () => {
    const bytes = await readFile(
      path.resolve("sample_sources/sample_lecture_notes_probability.pdf"),
    );

    const text = await extractPdfText(new Uint8Array(bytes));

    expect(text.toLowerCase()).toContain("probability");
    expect(text.endsWith("\f")).toBe(true);
    expect(extractedPageCountFromContent(text)).toBe(11);
    expect(extractedTokenCountFromContent(text)).toBeGreaterThan(0);
  });

  it("extracts a single-page PDF", async () => {
    const bytes = await readFile(
      path.resolve("sample_sources/sample_exam_question_probability.pdf"),
    );

    const text = await extractPdfText(new Uint8Array(bytes));

    expect(text.toLowerCase()).toContain("probability");
    expect(extractedPageCountFromContent(text)).toBe(1);
  });
});
