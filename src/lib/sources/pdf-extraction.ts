import "server-only";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
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
