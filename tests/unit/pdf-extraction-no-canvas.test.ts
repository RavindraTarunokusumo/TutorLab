import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Simulate the production runtime (e.g. Hostinger/Linux) where the native
// @napi-rs/canvas binary for the server platform is not installed, so importing
// it throws. pdfjs text extraction does not require canvas, so extraction must
// still succeed instead of failing the whole source ingestion.
vi.mock("@napi-rs/canvas", () => {
  throw new Error("Cannot find module '@napi-rs/canvas-linux-x64-gnu'");
});

import { extractPdfText } from "@/lib/sources/pdf-extraction";

describe("PDF extraction without @napi-rs/canvas", () => {
  it("extracts text and page boundaries when canvas is unavailable", async () => {
    const bytes = await readFile(
      path.resolve("sample_sources/sample_exam_question_probability.pdf"),
    );

    const text = await extractPdfText(new Uint8Array(bytes));

    expect(text.toLowerCase()).toContain("probability");
    expect(text.endsWith("\f")).toBe(true);
  });
});
