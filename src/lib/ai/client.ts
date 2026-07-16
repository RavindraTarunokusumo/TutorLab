import "server-only";
import OpenAI from "openai";
import { getOpenAIEnv } from "@/lib/env";

let openAIClient: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  openAIClient ??= new OpenAI({
    apiKey: getOpenAIEnv().OPENAI_API_KEY,
  });

  return openAIClient;
}
