import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use the PostgreSQL protocol",
    ),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;
export type ServerEnv = DatabaseEnv & OpenAIEnv;

export function parseDatabaseEnv(
  input: Record<string, string | undefined>,
): DatabaseEnv {
  return databaseEnvSchema.parse(input);
}

export function parseOpenAIEnv(
  input: Record<string, string | undefined>,
): OpenAIEnv {
  return openAIEnvSchema.parse(input);
}

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  return {
    ...parseDatabaseEnv(input),
    ...parseOpenAIEnv(input),
  };
}
