import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

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

export function getProjectEditToken(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return undefined;
  }

  return cookie
    .split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([name]) => name === "tutorlab_project_edit")?.[1];
}
