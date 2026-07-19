import "server-only";
import OpenAI from "openai";
import { getOpenAIEnv } from "@/lib/env";
import { getRequestOpenAIKey } from "@/lib/ai/session-key";

let openAIClient: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  const requestApiKey = getRequestOpenAIKey();
  if (requestApiKey) return new OpenAI({ apiKey: requestApiKey });

  openAIClient ??= new OpenAI({
    apiKey: getOpenAIEnv().OPENAI_API_KEY,
  });

  return openAIClient;
}
