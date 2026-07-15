import "server-only";

export function countExtractedTokens(content: string): number {
  return content.match(/[\p{L}\p{N}_]+|[^\s]/gu)?.length ?? 0;
}

export function extractedTokenCountFromContent(content: string | undefined): number | undefined {
  if (content === undefined) {
    return undefined;
  }
  return countExtractedTokens(content);
}
