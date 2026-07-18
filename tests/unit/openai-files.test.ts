import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  extractedPageCountFromContent,
  extractedTokenCountFromContent,
} from "@/lib/sources/extraction-metrics";

vi.mock("server-only", () => ({}));

const fivePagePdf = Uint8Array.from(
  Buffer.from(
    "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgKHB5cGRmKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDUKL0tpZHMgWyA0IDAgUiA1IDAgUiA2IDAgUiA3IDAgUiA4IDAgUiBdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwLjAgMC4wIDYxMiA3OTIgXQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNyAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCjggMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwLjAgMC4wIDYxMiA3OTIgXQovUGFyZW50IDIgMCBSCj4+CmVuZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1NCAwMDAwMCBuIAowMDAwMDAwMTM3IDAwMDAwIG4gCjAwMDAwMDAxODYgMDAwMDAgbiAKMDAwMDAwMDI4MCAwMDAwMCBuIAowMDAwMDAwMzc0IDAwMDAwIG4gCjAwMDAwMDA0NjggMDAwMDAgbiAKMDAwMDAwMDU2MiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDkKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjY1NgolJUVPRgo=",
    "base64",
  ),
);

const mocks = vi.hoisted(() => ({
  originalContent: vi.fn(),
  parsedContent: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  getOpenAIClient: () => ({
    files: { content: mocks.originalContent },
    vectorStores: { files: { content: mocks.parsedContent } },
  }),
}));

vi.mock("@/lib/fixture-runtime", () => ({
  getFixtureOpenAIFileProvider: vi.fn(),
  isFixtureRuntime: () => false,
}));

import { getOpenAIFileProvider } from "@/lib/ai/openai-files";

describe("OpenAI file extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the original PDF instead of inflated vector-store parsed content", async () => {
    mocks.originalContent.mockResolvedValue({
      arrayBuffer: async () => fivePagePdf.slice().buffer,
    });
    mocks.parsedContent.mockReturnValue(
      (async function* () {
        yield { text: `${"duplicated ".repeat(1000)}${"\f".repeat(952)}` };
      })(),
    );

    const text = await getOpenAIFileProvider().getExtractedText(
      "vs-alpha",
      "file-alpha",
      "application/pdf",
    );

    expect(extractedPageCountFromContent(text)).toBe(5);
    expect(extractedTokenCountFromContent(text)).toBe(0);
    expect(mocks.originalContent).toHaveBeenCalledWith("file-alpha");
    expect(mocks.parsedContent).not.toHaveBeenCalled();
  });

  it("uses original DOCX text and its saved page count", async () => {
    const archive = new JSZip();
    archive.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    archive.file(
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    archive.file(
      "word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>one two three four</w:t></w:r></w:p></w:body></w:document>',
    );
    archive.file(
      "word/_rels/document.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    );
    archive.file(
      "docProps/app.xml",
      '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>3</Pages></Properties>',
    );
    const docx = await archive.generateAsync({ type: "uint8array" });
    mocks.originalContent.mockResolvedValue({
      arrayBuffer: async () => docx.slice().buffer,
    });

    const text = await getOpenAIFileProvider().getExtractedText(
      "vs-alpha",
      "file-alpha",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    expect(extractedPageCountFromContent(text)).toBe(3);
    expect(extractedTokenCountFromContent(text)).toBe(4);
    expect(mocks.parsedContent).not.toHaveBeenCalled();
  });
});
