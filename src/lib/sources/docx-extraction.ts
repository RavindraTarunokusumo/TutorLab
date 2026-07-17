import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";

function pageCountFromProperties(
  properties: string | undefined,
): number | undefined {
  const value = properties?.match(/<Pages>\s*(\d+)\s*<\/Pages>/i)?.[1];
  if (!value) {
    return undefined;
  }
  const pageCount = Number(value);
  return Number.isSafeInteger(pageCount) && pageCount > 0
    ? pageCount
    : undefined;
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const buffer = Buffer.from(bytes);
  const [{ value }, archive] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    JSZip.loadAsync(buffer),
  ]);
  const properties = await archive.file("docProps/app.xml")?.async("string");
  const pageCount = pageCountFromProperties(properties);
  return pageCount === undefined ? value : `${value}${"\f".repeat(pageCount)}`;
}
