import "server-only";
import {
  Prisma,
  type TutorDesign as PrismaTutorDesign,
  type TutorVersion as PrismaTutorVersion,
} from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  getFixtureTutorRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  TutorDesignSchema,
  TutorDesignSetSchema,
  TutorSpecSchema,
  type TutorDesign,
  type TutorDesignSet,
  type TutorSpec,
} from "@/lib/schemas";

export type TutorDesignRecord = {
  id: string;
  projectId: string;
  courseModelVersionId: string;
  generationId: string;
  artifact: TutorDesign;
  excludedCatalogOptions: TutorDesignSet["excludedCatalogOptions"];
  generatedAt: Date;
  createdAt: Date;
};

export type TutorVersionRecord = {
  id: string;
  projectId: string;
  version: number;
  courseModelVersionId: string;
  selectedDesignId: string;
  selectedDesignIdentity: TutorSpec["selectedDesign"];
  spec: TutorSpec;
  compiledPrompt: string;
  status: "compiling" | "ready" | "failed";
  createdAt: Date;
  compiledAt: Date | null;
};

export type CreateTutorVersionInput = {
  id: string;
  projectId: string;
  spec: TutorSpec;
  compiledPrompt: string;
  status?: TutorVersionRecord["status"];
  compiledAt?: Date;
};

export interface TutorRepository {
  saveDesignSet(input: TutorDesignSet): Promise<TutorDesignRecord[]>;
  listDesigns(projectId: string, courseModelVersionId?: string): Promise<TutorDesignRecord[]>;
  findDesign(projectId: string, designId: string): Promise<TutorDesignRecord | null>;
  createVersion(input: CreateTutorVersionInput): Promise<TutorVersionRecord>;
  findVersion(projectId: string, tutorVersionId: string): Promise<TutorVersionRecord | null>;
  findLatestVersion(projectId: string): Promise<TutorVersionRecord | null>;
  findActiveVersion?(projectId: string): Promise<TutorVersionRecord | null>;
}

function toTutorDesignRecord(design: PrismaTutorDesign): TutorDesignRecord {
  return {
    id: design.id,
    projectId: design.projectId,
    courseModelVersionId: design.courseModelVersionId,
    generationId: design.generationId,
    artifact: TutorDesignSchema.parse(design.artifact),
    excludedCatalogOptions: TutorDesignSetSchema.shape.excludedCatalogOptions.parse(
      design.excludedOptions,
    ),
    generatedAt: design.generatedAt,
    createdAt: design.createdAt,
  };
}

function toTutorVersionRecord(version: PrismaTutorVersion): TutorVersionRecord {
  return {
    id: version.id,
    projectId: version.projectId,
    version: version.version,
    courseModelVersionId: version.courseModelVersionId,
    selectedDesignId: version.selectedDesignId,
    selectedDesignIdentity: TutorSpecSchema.shape.selectedDesign.parse(
      version.selectedDesignIdentity,
    ),
    spec: TutorSpecSchema.parse(version.spec),
    compiledPrompt: version.compiledPrompt,
    status: version.status,
    createdAt: version.createdAt,
    compiledAt: version.compiledAt,
  };
}

function assertVersionInput(input: CreateTutorVersionInput): TutorSpec {
  const spec = TutorSpecSchema.parse(input.spec);
  if (
    spec.projectId !== input.projectId ||
    spec.tutorId !== input.id ||
    !input.compiledPrompt.trim() ||
    input.compiledPrompt.length > 100_000
  ) {
    throw new Error("Tutor version input is invalid");
  }
  return spec;
}

export function getTutorRepository(): TutorRepository {
  if (isFixtureRuntime()) return getFixtureTutorRepository();
  const db = getDb();

  return {
    async saveDesignSet(input) {
      const set = TutorDesignSetSchema.parse(input);
      const generatedAt = new Date(set.generatedAt);
      await db.tutorDesign.createMany({
        data: set.candidates.map((candidate) => ({
          id: candidate.id,
          projectId: set.projectId,
          courseModelVersionId: set.courseModelVersionId,
          generationId: set.id,
          artifact: candidate as Prisma.InputJsonValue,
          excludedOptions: set.excludedCatalogOptions as Prisma.InputJsonValue,
          generatedAt,
        })),
      });
      return (await db.tutorDesign.findMany({
        where: { projectId: set.projectId, generationId: set.id },
        orderBy: { createdAt: "asc" },
      })).map(toTutorDesignRecord);
    },
    async listDesigns(projectId, courseModelVersionId) {
      return (await db.tutorDesign.findMany({
        where: {
          projectId,
          ...(courseModelVersionId ? { courseModelVersionId } : {}),
        },
        orderBy: { createdAt: "desc" },
      })).map(toTutorDesignRecord);
    },
    async findDesign(projectId, designId) {
      const design = await db.tutorDesign.findUnique({
        where: { projectId_id: { projectId, id: designId } },
      });
      return design ? toTutorDesignRecord(design) : null;
    },
    async createVersion(input) {
      const spec = assertVersionInput(input);
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.projectId}))`;
        const selected = await tx.tutorDesign.findUnique({
          where: {
            projectId_id: {
              projectId: input.projectId,
              id: spec.selectedDesign.designId,
            },
          },
        });
        if (!selected || selected.courseModelVersionId !== spec.courseModelVersionId) {
          throw new Error("Selected tutor design is unavailable for this course model");
        }
        const selectedArtifact = TutorDesignSchema.parse(selected.artifact);
        if (
          selectedArtifact.archetypeId !== spec.selectedDesign.archetypeId ||
          selectedArtifact.templateVersion !== spec.selectedDesign.templateVersion
        ) {
          throw new Error("Selected tutor design identity does not match the specification");
        }
        const latest = await tx.tutorVersion.findFirst({
          where: { projectId: input.projectId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;
        if (spec.version !== nextVersion) {
          throw new Error("Tutor specification version is not monotonic");
        }
        const record = await tx.tutorVersion.create({
          data: {
            id: input.id,
            projectId: input.projectId,
            version: nextVersion,
            courseModelVersionId: spec.courseModelVersionId,
            selectedDesignId: spec.selectedDesign.designId,
            selectedDesignIdentity: spec.selectedDesign as Prisma.InputJsonValue,
            spec: spec as Prisma.InputJsonValue,
            compiledPrompt: input.compiledPrompt,
            status: input.status ?? "ready",
            ...(input.compiledAt ? { compiledAt: input.compiledAt } : {}),
          },
        });
        return toTutorVersionRecord(record);
      });
    },
    async findVersion(projectId, tutorVersionId) {
      const version = await db.tutorVersion.findUnique({
        where: { projectId_id: { projectId, id: tutorVersionId } },
      });
      return version ? toTutorVersionRecord(version) : null;
    },
    async findLatestVersion(projectId) {
      const version = await db.tutorVersion.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });
      return version ? toTutorVersionRecord(version) : null;
    },
    async findActiveVersion(projectId) {
      const version = await db.tutorVersion.findFirst({
        where: { projectId, status: "ready" },
        orderBy: { version: "desc" },
      });
      return version ? toTutorVersionRecord(version) : null;
    },
  };
}
