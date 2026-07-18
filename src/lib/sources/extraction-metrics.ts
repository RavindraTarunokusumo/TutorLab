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

/**
 * The provider's parsed-content endpoint does not expose a page field. Only count
 * pages when it preserves explicit form-feed page boundaries; otherwise callers
 * must leave the source pending rather than guessing from bytes or text length.
 */
export function extractedPageCountFromContent(
  content: string | undefined,
): number | undefined {
  if (
    content === undefined ||
    !content.includes("\f")
  ) {
    return undefined;
  }
  const pages = content.split("\f");
  if (pages.at(-1) === "") {
    pages.pop();
  }
  return pages.length;
}
