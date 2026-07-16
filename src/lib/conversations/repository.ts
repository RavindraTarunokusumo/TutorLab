import "server-only";
import {
  Prisma,
  type Conversation as PrismaConversation,
  type Message as PrismaMessage,
} from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureConversationRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  ConversationMessageSchema,
  ConversationSchema,
  type AssistanceState,
  type Conversation,
  type ConversationMessage,
} from "@/lib/schemas";

type ConversationWithMessages = PrismaConversation & { messages: PrismaMessage[] };

export interface ConversationRepository {
  create(input: Conversation): Promise<Conversation>;
  getOrCreateTeacherPreview(input: Conversation): Promise<Conversation>;
  findById(projectId: string, conversationId: string): Promise<Conversation | null>;
  findLatestForTutor(input: {
    projectId: string;
    tutorVersionId: string;
    mode: Conversation["mode"];
  }): Promise<Conversation | null>;
  appendMessage(input: {
    projectId: string;
    conversationId: string;
    message: ConversationMessage;
    currentState?: AssistanceState;
  }): Promise<Conversation>;
  claimPreview(input: { projectId: string; conversationId: string; token: string; staleBefore: Date }): Promise<boolean>;
  releasePreviewClaim(input: { projectId: string; conversationId: string; token: string }): Promise<void>;
  delete(projectId: string, conversationId: string): Promise<void>;
}

function toConversation(record: ConversationWithMessages): Conversation {
  return ConversationSchema.parse({
    schemaVersion: "0.1",
    id: record.id,
    projectId: record.projectId,
    tutorVersionId: record.tutorVersionId,
    mode: record.mode,
    currentState: record.currentState,
    messages: record.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.metadata ? { metadata: message.metadata } : {}),
      createdAt: message.createdAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function conversationInclude() {
  return { messages: { orderBy: { createdAt: "asc" as const } } };
}

export function getConversationRepository(): ConversationRepository {
  if (isFixtureRuntime()) return getFixtureConversationRepository();
  const db = getDb();
  return {
    async create(input) {
      const conversation = ConversationSchema.parse(input);
      const created = await db.conversation.create({
        data: {
          id: conversation.id,
          projectId: conversation.projectId,
          tutorVersionId: conversation.tutorVersionId,
          mode: conversation.mode,
          currentState: conversation.currentState,
          createdAt: new Date(conversation.createdAt),
          updatedAt: new Date(conversation.updatedAt),
          messages: {
            create: conversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              ...(message.metadata
                ? { metadata: message.metadata as Prisma.InputJsonValue }
                : {}),
              createdAt: new Date(message.createdAt),
            })),
          },
        },
        include: conversationInclude(),
      });
      return toConversation(created);
    },
    async getOrCreateTeacherPreview(input) {
      const conversation = ConversationSchema.parse(input);
      if (conversation.mode !== "teacher_preview" || conversation.messages.length !== 0) {
        throw new Error("Teacher preview conversation input is invalid");
      }
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${conversation.projectId}:${conversation.tutorVersionId}:teacher_preview`}))`;
        const existing = await tx.conversation.findFirst({
          where: { projectId: conversation.projectId, tutorVersionId: conversation.tutorVersionId, mode: "teacher_preview" },
          orderBy: { updatedAt: "desc" }, include: conversationInclude(),
        });
        if (existing) return toConversation(existing);
        const created = await tx.conversation.create({
          data: { id: conversation.id, projectId: conversation.projectId, tutorVersionId: conversation.tutorVersionId, mode: conversation.mode, currentState: conversation.currentState, createdAt: new Date(conversation.createdAt), updatedAt: new Date(conversation.updatedAt) },
          include: conversationInclude(),
        });
        return toConversation(created);
      });
    },
    async findById(projectId, conversationId) {
      const conversation = await db.conversation.findUnique({
        where: { projectId_id: { projectId, id: conversationId } },
        include: conversationInclude(),
      });
      return conversation ? toConversation(conversation) : null;
    },
    async findLatestForTutor(input) {
      const conversation = await db.conversation.findFirst({
        where: input,
        orderBy: { updatedAt: "desc" },
        include: conversationInclude(),
      });
      return conversation ? toConversation(conversation) : null;
    },
    async appendMessage(input) {
      const message = ConversationMessageSchema.parse(input.message);
      const state = input.currentState;
      const updated = await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "Conversation"
          WHERE "projectId" = ${input.projectId} AND "id" = ${input.conversationId}
          FOR UPDATE
        `;
        if (locked.length === 0) throw new Error("Conversation not found");
        const messageCount = await tx.message.count({
          where: { conversationId: input.conversationId },
        });
        if (messageCount >= 100) throw new Error("Conversation message limit reached");
        return tx.conversation.update({
          where: { id: input.conversationId },
          data: {
            ...(state ? { currentState: state } : {}),
            messages: {
              create: {
                id: message.id,
                role: message.role,
                content: message.content,
                ...(message.metadata
                  ? { metadata: message.metadata as Prisma.InputJsonValue }
                  : {}),
                createdAt: new Date(message.createdAt),
              },
            },
          },
          include: conversationInclude(),
        });
      });
      return toConversation(updated);
    },
    async claimPreview(input) {
      const claimed = await db.$executeRaw`
        UPDATE "Conversation"
        SET "previewClaimToken" = ${input.token}, "previewClaimedAt" = NOW()
        WHERE "projectId" = ${input.projectId} AND "id" = ${input.conversationId}
          AND "mode" = 'teacher_preview'
          AND ("previewClaimToken" IS NULL OR "previewClaimedAt" < ${input.staleBefore})
      `;
      return claimed === 1;
    },
    async releasePreviewClaim(input) {
      await db.$executeRaw`
        UPDATE "Conversation"
        SET "previewClaimToken" = NULL, "previewClaimedAt" = NULL
        WHERE "projectId" = ${input.projectId} AND "id" = ${input.conversationId}
          AND "previewClaimToken" = ${input.token}
      `;
    },
    async delete(projectId, conversationId) {
      await db.conversation.deleteMany({
        where: { projectId, id: conversationId },
      });
    },
  };
}
