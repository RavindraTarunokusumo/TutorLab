import "server-only";
import { PrismaClient } from "@prisma/client";
import { getDatabaseEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  tutorLabDb?: PrismaClient;
};

let dbClient = globalForPrisma.tutorLabDb;

export function getDb(): PrismaClient {
  dbClient ??= new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseEnv().DATABASE_URL,
      },
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.tutorLabDb = dbClient;
  }

  return dbClient;
}
