import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PROJECT_EDIT_COOKIE = "tutorlab_project_edit";

const editTokenSecretSchema = z
  .string()
  .min(32, "PROJECT_EDIT_TOKEN_SECRET must be at least 32 characters");

function getProjectEditTokenSecret(): string {
  return editTokenSecretSchema.parse(process.env.PROJECT_EDIT_TOKEN_SECRET);
}

function signNonce(nonce: string): string {
  return createHmac("sha256", getProjectEditTokenSecret())
    .update(nonce)
    .digest("base64url");
}

export function createProjectEditToken(): string {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${signNonce(nonce)}`;
}

export function hashProjectEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyProjectEditToken(token: string): boolean {
  const [nonce, signature, ...extra] = token.split(".");
  if (!nonce || !signature || extra.length > 0) {
    return false;
  }

  const expected = Buffer.from(signNonce(nonce));
  const provided = Buffer.from(signature);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export function projectEditCookieName(projectId: string): string {
  return `${PROJECT_EDIT_COOKIE}_${projectId}`;
}

function parseCookies(cookie: string | null): Array<[string, string]> {
  if (!cookie) return [];

  return cookie
    .split(";")
    .map((part) => part.trim().split("=", 2))
    .filter((part): part is [string, string] => Boolean(part[0] && part[1]));
}

export function getProjectEditToken(
  request: Request,
  projectId?: string,
): string | undefined {
  const cookie = request.headers.get("cookie");
  const cookies = parseCookies(cookie);
  if (projectId) {
    const projectToken = cookies.find(
      ([name]) => name === projectEditCookieName(projectId),
    )?.[1];
    if (projectToken) return projectToken;
  }

  return cookies.find(([name]) => name === PROJECT_EDIT_COOKIE)?.[1];
}

export function getProjectEditTokens(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): string[] {
  return [...new Set(
    cookies
      .filter(
        ({ name }) =>
          name === PROJECT_EDIT_COOKIE ||
          name.startsWith(`${PROJECT_EDIT_COOKIE}_`),
      )
      .map(({ value }) => value),
  )];
}
