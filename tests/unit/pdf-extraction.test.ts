import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractPdfText } from "@/lib/sources/pdf-extraction";

describe("PDF extraction", () => {
  it("loads the Node canvas globals before extracting text", async () => {
    const bytes = await readFile(
      path.resolve("sample_sources/sample_lecture_notes_probability.pdf"),
    );

    const text = await extractPdfText(new Uint8Array(bytes));

    expect(text.toLowerCase()).toContain("probability");
    expect(text.endsWith("\f")).toBe(true);
  });
});
