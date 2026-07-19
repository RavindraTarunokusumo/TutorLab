import { NextResponse } from "next/server";
import {
  canUseInMemoryOpenAIKeySessions,
  consumeOpenAIKeyEnrollment,
  createOpenAIKeySession,
  getSessionOpenAIKey,
  hasEnvironmentOpenAIKey,
  isValidOpenAIKey,
  OPENAI_KEY_COOKIE,
  verifyOpenAIKey,
} from "@/lib/ai/session-key";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  return NextResponse.json(
    {
      configured:
        hasEnvironmentOpenAIKey() || Boolean(getSessionOpenAIKey(request)),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin credential requests are not allowed." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  if (hasEnvironmentOpenAIKey()) {
    return NextResponse.json(
      { configured: true },
      { headers: NO_STORE_HEADERS },
    );
  }

  if (!canUseInMemoryOpenAIKeySessions()) {
    return NextResponse.json(
      {
        error:
          "This deployment requires a server-managed OpenAI API key or explicit single-instance key sessions.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const body = await request.json().catch(() => null);
  if (!isValidOpenAIKey(body?.apiKey)) {
    return NextResponse.json(
      { error: "Enter a valid OpenAI API key." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!consumeOpenAIKeyEnrollment(request)) {
    return NextResponse.json(
      { error: "Too many key connection attempts. Try again later." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "retry-after": "600" },
      },
    );
  }

  const verification = await verifyOpenAIKey(body.apiKey);
  if (verification === "invalid") {
    return NextResponse.json(
      { error: "OpenAI did not accept this API key." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (verification === "unavailable") {
    return NextResponse.json(
      { error: "OpenAI key verification is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const sessionId = createOpenAIKeySession(body.apiKey);
  if (!sessionId) {
    return NextResponse.json(
      { error: "Key sessions are temporarily at capacity. Try again later." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const response = NextResponse.json(
    { configured: true },
    { headers: NO_STORE_HEADERS },
  );
  response.cookies.set({
    name: OPENAI_KEY_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
