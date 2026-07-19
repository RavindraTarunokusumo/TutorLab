import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { isFixtureRuntime } from "@/lib/fixture-runtime";

export const OPENAI_KEY_COOKIE = "tutorlab_openai_session";
export const OPENAI_KEY_REQUIRED = "OPENAI_API_KEY_REQUIRED";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSION_KEYS = 1_000;
const ENROLLMENT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ENROLLMENTS_PER_WINDOW = 10;
const MAX_ENROLLMENT_IDENTITIES = 5_000;
const requestKeyStorage = new AsyncLocalStorage<string>();

type SessionKey = { apiKey: string; expiresAt: number };
type EnrollmentWindow = { attempts: number; resetsAt: number };

declare global {
  var tutorLabOpenAIKeySessions: Map<string, SessionKey> | undefined;
  var tutorLabOpenAIKeyEnrollments: Map<string, EnrollmentWindow> | undefined;
}

const sessionKeys =
  globalThis.tutorLabOpenAIKeySessions ??
  (globalThis.tutorLabOpenAIKeySessions = new Map<string, SessionKey>());
const enrollmentWindows =
  globalThis.tutorLabOpenAIKeyEnrollments ??
  (globalThis.tutorLabOpenAIKeyEnrollments = new Map<
    string,
    EnrollmentWindow
  >());

function pruneExpiredSessions(now = Date.now()) {
  for (const [sessionId, session] of sessionKeys) {
    if (session.expiresAt <= now) sessionKeys.delete(sessionId);
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function hasEnvironmentOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function isValidOpenAIKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 512 &&
    /^\S+$/.test(value)
  );
}

export function canUseInMemoryOpenAIKeySessions(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.TUTORLAB_IN_MEMORY_OPENAI_KEY_SESSIONS === "1"
  );
}

function enrollmentIdentity(request: Request): string {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const candidate =
    forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
  const address = isIP(candidate) ? candidate : "unknown";
  return createHash("sha256").update(address).digest("base64url").slice(0, 22);
}

export function consumeOpenAIKeyEnrollment(request: Request): boolean {
  const now = Date.now();
  for (const [identity, window] of enrollmentWindows) {
    if (window.resetsAt <= now) enrollmentWindows.delete(identity);
  }

  const identity = enrollmentIdentity(request);
  const current = enrollmentWindows.get(identity);
  if (current && current.resetsAt > now) {
    if (current.attempts >= MAX_ENROLLMENTS_PER_WINDOW) return false;
    current.attempts += 1;
    return true;
  }

  if (enrollmentWindows.size >= MAX_ENROLLMENT_IDENTITIES) return false;
  enrollmentWindows.set(identity, {
    attempts: 1,
    resetsAt: now + ENROLLMENT_WINDOW_MS,
  });
  return true;
}

export function createOpenAIKeySession(apiKey: string): string | null {
  if (!canUseInMemoryOpenAIKeySessions()) return null;
  pruneExpiredSessions();
  if (sessionKeys.size >= MAX_SESSION_KEYS) return null;

  const sessionId = randomBytes(32).toString("base64url");
  sessionKeys.set(sessionId, {
    apiKey,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return sessionId;
}

export function getSessionOpenAIKey(request: Request): string | null {
  if (!canUseInMemoryOpenAIKeySessions()) return null;
  const sessionId = readCookie(request, OPENAI_KEY_COOKIE);
  if (!sessionId) return null;

  const session = sessionKeys.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessionKeys.delete(sessionId);
    return null;
  }

  return session.apiKey;
}

export function hasOpenAIKeyForRequest(request: Request): boolean {
  return (
    isFixtureRuntime() ||
    hasEnvironmentOpenAIKey() ||
    Boolean(getSessionOpenAIKey(request))
  );
}

export function getRequestOpenAIKey(): string | undefined {
  return requestKeyStorage.getStore();
}

export async function withOpenAIRequestKey(
  request: Request,
  callback: () => Promise<Response>,
): Promise<Response> {
  if (isFixtureRuntime() || hasEnvironmentOpenAIKey()) return callback();

  const apiKey = getSessionOpenAIKey(request);
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "An OpenAI API key is required for this action.",
        code: OPENAI_KEY_REQUIRED,
      },
      { status: 428 },
    );
  }

  return requestKeyStorage.run(apiKey, callback);
}
