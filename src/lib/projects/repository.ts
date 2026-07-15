import "server-only";
import { Prisma, type Project as PrismaProject } from "@prisma/client";
import { getDb } from "@/lib/db";
import type {
  ProjectStage,
  TeachingBriefPatch,
} from "@/lib/schemas/project";

export type ProjectRecord = {
  id: string;
  name: string;
  stage: ProjectStage;
  teachingBrief: TeachingBriefPatch | Record<string, never>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProjectRecordInput = {
  id: string;
  name: string;
  stage: ProjectStage;
  teachingBrief: TeachingBriefPatch | Record<string, never>;
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
    patch: TeachingBriefPatch,
  ): Promise<ProjectRecord>;
}

function toProjectRecord(project: PrismaProject): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    stage: project.stage,
    teachingBrief: project.teachingBrief as TeachingBriefPatch,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function getProjectRepository(): ProjectRepository {
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
  };
}
