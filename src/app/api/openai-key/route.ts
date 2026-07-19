import { NextResponse } from "next/server";
import {
  createOpenAIKeySession,
  getSessionOpenAIKey,
  hasEnvironmentOpenAIKey,
  isValidOpenAIKey,
  OPENAI_KEY_COOKIE,
} from "@/lib/ai/session-key";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
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

  const body = await request.json().catch(() => null);
  if (!isValidOpenAIKey(body?.apiKey)) {
    return NextResponse.json(
      { error: "Enter a valid OpenAI API key." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const response = NextResponse.json(
    { configured: true },
    { headers: NO_STORE_HEADERS },
  );
  response.cookies.set({
    name: OPENAI_KEY_COOKIE,
    value: createOpenAIKeySession(body.apiKey),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
