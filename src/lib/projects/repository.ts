import "server-only";
import { Prisma, type Project as PrismaProject } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureProjectRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import type { TeachingBrief } from "@/lib/schemas/teaching-brief";
import type { ProjectStage, TeachingBriefPatch } from "@/lib/schemas/project";

export type StoredTeachingBrief =
  | TeachingBriefPatch
  | TeachingBrief
  | Record<string, never>;

export type ProjectRecord = {
  id: string;
  name: string;
  stage: ProjectStage;
  teachingBrief: StoredTeachingBrief;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProjectRecordInput = {
  id: string;
  name: string;
  stage: ProjectStage;
  teachingBrief: StoredTeachingBrief;
  editTokenHash: string;
};

export interface ProjectRepository {
  create(input: CreateProjectRecordInput): Promise<ProjectRecord>;
  findById(id: string): Promise<ProjectRecord | null>;
  findByIdAndEditTokenHash(
    id: string,
    editTokenHash: string,
  ): Promise<ProjectRecord | null>;
  updateTeachingBrief(
    id: string,
    patch: TeachingBriefPatch | TeachingBrief,
  ): Promise<ProjectRecord>;
  updateStage(id: string, stage: ProjectStage): Promise<ProjectRecord>;
  findVectorStoreId(projectId: string): Promise<string | null>;
  claimVectorStoreId(projectId: string, candidateId: string): Promise<string>;
  acquireVectorStoreProvisioning(
    projectId: string,
    token: string,
    staleBefore: Date,
  ): Promise<{ vectorStoreId: string | null; acquired: boolean }>;
  completeVectorStoreProvisioning(
    projectId: string,
    token: string,
    vectorStoreId: string,
  ): Promise<string | null>;
  releaseVectorStoreProvisioning(
    projectId: string,
    token: string,
  ): Promise<void>;
}

function toProjectRecord(project: PrismaProject): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    stage: project.stage,
    teachingBrief: project.teachingBrief as StoredTeachingBrief,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function getProjectRepository(): ProjectRepository {
  if (isFixtureRuntime()) return getFixtureProjectRepository();
  const db = getDb();

  return {
    async create(input) {
      return toProjectRecord(
        await db.project.create({
          data: {
            ...input,
            teachingBrief: input.teachingBrief as Prisma.InputJsonValue,
          },
        }),
      );
    },
    async findById(id) {
      const project = await db.project.findUnique({ where: { id } });
      return project ? toProjectRecord(project) : null;
    },
    async findByIdAndEditTokenHash(id, editTokenHash) {
      const project = await db.project.findFirst({
        where: { id, editTokenHash },
      });
      return project ? toProjectRecord(project) : null;
    },
    async updateTeachingBrief(id, patch) {
      const current = await db.project.findUniqueOrThrow({ where: { id } });
      const teachingBrief = {
        ...(current.teachingBrief as Record<string, unknown>),
        ...patch,
      } as Prisma.InputJsonValue;
      return toProjectRecord(
        await db.project.update({
          where: { id },
          data: { teachingBrief },
        }),
      );
    },
    async updateStage(id, stage) {
      return toProjectRecord(
        await db.project.update({ where: { id }, data: { stage } }),
      );
    },
    async findVectorStoreId(projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { vectorStoreId: true },
      });
      if (!project) {
        throw new Error("Project not found");
      }
      return project.vectorStoreId;
    },
    async claimVectorStoreId(projectId, candidateId) {
      const claimed = await db.project.updateMany({
        where: { id: projectId, vectorStoreId: null },
        data: { vectorStoreId: candidateId },
      });
      if (claimed.count === 1) {
        return candidateId;
      }
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { vectorStoreId: true },
      });
      if (!project.vectorStoreId) {
        throw new Error("Project vector store was not persisted");
      }
      return project.vectorStoreId;
    },
    async acquireVectorStoreProvisioning(projectId, token, staleBefore) {
      const acquired = await db.project.updateMany({
        where: {
          id: projectId,
          vectorStoreId: null,
          OR: [
            { vectorStoreProvisioningToken: null },
            { vectorStoreProvisioningStartedAt: { lt: staleBefore } },
          ],
        },
        data: {
          vectorStoreProvisioningToken: token,
          vectorStoreProvisioningStartedAt: new Date(),
        },
      });
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { vectorStoreId: true },
      });
      return {
        vectorStoreId: project.vectorStoreId,
        acquired: acquired.count === 1,
      };
    },
    async completeVectorStoreProvisioning(projectId, token, vectorStoreId) {
      const completed = await db.project.updateMany({
        where: {
          id: projectId,
          vectorStoreId: null,
          vectorStoreProvisioningToken: token,
        },
        data: {
          vectorStoreId,
          vectorStoreProvisioningToken: null,
          vectorStoreProvisioningStartedAt: null,
        },
      });
      if (completed.count === 1) {
        return vectorStoreId;
      }
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { vectorStoreId: true },
      });
      return project.vectorStoreId;
    },
    async releaseVectorStoreProvisioning(projectId, token) {
      await db.project.updateMany({
        where: { id: projectId, vectorStoreProvisioningToken: token },
        data: {
          vectorStoreProvisioningToken: null,
          vectorStoreProvisioningStartedAt: null,
        },
      });
    },
  };
}
