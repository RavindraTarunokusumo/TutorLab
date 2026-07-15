import "server-only";
import {
  parseDatabaseEnv,
  parseOpenAIEnv,
  type DatabaseEnv,
  type OpenAIEnv,
  type ServerEnv,
} from "@/lib/env-schema";

let databaseEnv: DatabaseEnv | undefined;
let openAIEnv: OpenAIEnv | undefined;
let serverEnv: ServerEnv | undefined;

export function getDatabaseEnv(): DatabaseEnv {
  databaseEnv ??= parseDatabaseEnv({
    DATABASE_URL: process.env.DATABASE_URL,
  });

  return databaseEnv;
}

export function getOpenAIEnv(): OpenAIEnv {
  openAIEnv ??= parseOpenAIEnv({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });

  return openAIEnv;
}

export function getServerEnv(): ServerEnv {
  serverEnv ??= {
    ...getDatabaseEnv(),
    ...getOpenAIEnv(),
  };

  return serverEnv;
}
