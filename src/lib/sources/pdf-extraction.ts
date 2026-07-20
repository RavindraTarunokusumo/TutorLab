import "server-only";

async function loadPdfJs() {
  const canvas = await import("@napi-rs/canvas");
  const runtimeGlobals = globalThis as unknown as Record<string, unknown>;

  runtimeGlobals.DOMMatrix ??= canvas.DOMMatrix;
  runtimeGlobals.ImageData ??= canvas.ImageData;
  runtimeGlobals.Path2D ??= canvas.Path2D;

  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" "),
      );
    }
    return `${pages.join("\f")}\f`;
  } finally {
    await document.destroy();
  }
}
