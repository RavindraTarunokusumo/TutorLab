import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

// unpdf bundles a serverless build of pdf.js: no separate pdf.worker.mjs to
// resolve and no @napi-rs/canvas native binary. pd.js's own worker loading
// fails on some managed Node hosts ("Setting up fake worker failed: Cannot
// find module .../pdf.worker.mjs"), so extraction goes through unpdf instead.
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  // Keep the form-feed page boundaries the metrics helpers rely on.
  return `${pages.join("\f")}\f`;
}
