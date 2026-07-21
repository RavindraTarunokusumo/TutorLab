import "server-only";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePdfWorkerSrc(): string | undefined {
  // Resolve pdf.worker.mjs from the app's node_modules (relative to cwd) and
  // return a proper file:// URL. pdf.js otherwise computes the worker path
  // itself and imports it via a bare path, which fails on some hosts with
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  try {
    const require = createRequire(
      pathToFileURL(join(process.cwd(), "package.json")).href,
    );
    const workerPath = require.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
    return pathToFileURL(workerPath).href;
  } catch {
    return undefined;
  }
}

async function loadPdfJs() {
  try {
    const canvas = await import("@napi-rs/canvas");
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;

    runtimeGlobals.DOMMatrix ??= canvas.DOMMatrix;
    runtimeGlobals.ImageData ??= canvas.ImageData;
    runtimeGlobals.Path2D ??= canvas.Path2D;
  } catch (error) {
    // Text extraction via getTextContent() does not need canvas rendering. The
    // native @napi-rs/canvas binary may be missing for the server's platform
    // (e.g. a Linux host served from a Windows-built node_modules); continue
    // with text extraction rather than failing the entire source ingestion.
    console.warn(
      "@napi-rs/canvas unavailable; continuing PDF text extraction without it.",
      error,
    );
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // pd.js defaults workerSrc to the relative "./pdf.worker.mjs", which some Node
  // hosts fail to import ("Setting up fake worker failed: Cannot find module
  // .../pdf.worker.mjs"). Override it with a resolved absolute file:// URL so the
  // fake worker imports a valid, existing module specifier.
  const workerSrc = resolvePdfWorkerSrc();
  if (workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  return pdfjs;
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
