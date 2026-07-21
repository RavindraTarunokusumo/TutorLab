import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getCourseSynthesizer,
  parseSynthesizedCourseModel,
  type CourseSynthesizer,
} from "@/lib/ai/course-synthesizer";
import {
  COURSE_SYNTHESIS_DIRECT_INPUT_LIMIT,
  COURSE_SYNTHESIS_PROFILE,
  COURSE_MODEL_SCHEMA_VERSION,
  type CourseSynthesisPromptInput,
} from "@/lib/ai/prompts/course-synthesizer";
import { getDb } from "@/lib/db";
import {
  getFixtureCourseAnalysisRecords,
  getFixtureCourseModelRepository,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import {
  getProjectRepository,
  type ProjectRepository,
} from "@/lib/projects/repository";
import {
  getSourceRepository,
  type SourceRepository,
} from "@/lib/sources/repository";
import {
  CourseModelPatchSchema,
  CourseModelSchema,
  DocumentAnalysisSchema,
  type CourseModel,
  type CourseModelPatch,
  type CourseModelPatchOperation,
  type DocumentAnalysis,
  type SourceDocument,
  type TeacherDecision,
} from "@/lib/schemas";

export type CourseModelVersionRecord = {
  id: string;
  projectId: string;
  version: number;
  artifact: CourseModel;
  teacherEdited: boolean;
  createdAt: Date;
};

export class CourseModelVersionConflict extends Error {
  constructor(readonly code: "STALE" | "TEACHER_EDITS_REQUIRE_CONFIRMATION") {
    super(code);
  }
}

export interface CourseModelRepository {
  findLatest(projectId: string): Promise<CourseModelVersionRecord | null>;
  findById?(projectId: string, versionId: string): Promise<CourseModelVersionRecord | null>;
  create(input: {
    projectId: string;
    artifact: CourseModel;
    teacherEdited: boolean;
    expectedVersion: number;
    discardTeacherEdits?: boolean;
  }): Promise<CourseModelVersionRecord>;
  saveTeacherRevision(input: {
    projectId: string;
    expectedVersion: number;
    operations: CourseModelPatchOperation[];
    decidedAt: string;
  }): Promise<CourseModelVersionRecord>;
}

type PersistedCourseModelVersion = {
  id: string;
  projectId: string;
  version: number;
  artifact: Prisma.JsonValue;
  teacherEdited: boolean;
  createdAt: Date;
};

function toVersion(
  record: PersistedCourseModelVersion,
): CourseModelVersionRecord {
  return { ...record, artifact: CourseModelSchema.parse(record.artifact) };
}

export function getCourseModelRepository(): CourseModelRepository {
  if (isFixtureRuntime()) return getFixtureCourseModelRepository();
  const db = getDb();
  return {
    async findLatest(projectId) {
      const result = await db.courseModelVersion.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });
      return result ? toVersion(result) : null;
    },
    async findById(projectId, versionId) {
      const result = await db.courseModelVersion.findUnique({
        where: { projectId_id: { projectId, id: versionId } },
      });
      return result ? toVersion(result) : null;
    },
    async create(input) {
      return db.$transaction(
        async (transaction) => {
          const projects = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE
        `;
          if (projects.length === 0) throw new Error("Project not found");
          const latest = await transaction.courseModelVersion.findFirst({
            where: { projectId: input.projectId },
            orderBy: { version: "desc" },
            select: { version: true, teacherEdited: true },
          });
          const currentVersion = latest?.version ?? 0;
          if (currentVersion !== input.expectedVersion)
            throw new CourseModelVersionConflict("STALE");
          if (latest?.teacherEdited && !input.discardTeacherEdits)
            throw new CourseModelVersionConflict(
              "TEACHER_EDITS_REQUIRE_CONFIRMATION",
            );
          const version = currentVersion + 1;
          const artifact = CourseModelSchema.parse({
            ...input.artifact,
            version,
          });
          return toVersion(
            await transaction.courseModelVersion.create({
              data: {
                id: randomUUID(),
                projectId: input.projectId,
                version,
                artifact: artifact as Prisma.InputJsonValue,
                teacherEdited: input.teacherEdited,
              },
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    },
    async saveTeacherRevision(input) {
      return db.$transaction(
        async (transaction) => {
          const projects = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE
        `;
          if (projects.length === 0) throw new Error("Project not found");
          const latest = await transaction.courseModelVersion.findFirst({
            where: { projectId: input.projectId },
            orderBy: { version: "desc" },
          });
          if (!latest || latest.version !== input.expectedVersion)
            throw new CourseModelVersionConflict("STALE");
          const model = structuredClone(
            CourseModelSchema.parse(latest.artifact),
          );
          for (const operation of input.operations)
            applyOperation(model, operation);
          model.generatedAt = input.decidedAt;
          model.teacherDecisions = [
            ...model.teacherDecisions,
            ...teacherDecisions(input.operations, input.decidedAt),
          ];
          const artifact = CourseModelSchema.parse({
            ...model,
            version: latest.version + 1,
          });
          return toVersion(
            await transaction.courseModelVersion.create({
              data: {
                id: randomUUID(),
                projectId: input.projectId,
                version: latest.version + 1,
                artifact: artifact as Prisma.InputJsonValue,
                teacherEdited: true,
              },
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    },
  };
}

export class CourseSynthesisError extends Error {
  constructor(
    readonly code:
      | "NO_ANALYSES"
      | "INVALID_SYNTHESIS"
      | "STALE_COURSE_MODEL"
      | "INVALID_COURSE_MODEL_PATCH"
      | "TEACHER_EDITS_REQUIRE_CONFIRMATION",
  ) {
    super(
      code === "NO_ANALYSES"
        ? "No analyzed course materials are available to synthesize."
        : code === "STALE_COURSE_MODEL"
          ? "This course model changed. Reload it before saving corrections."
          : code === "TEACHER_EDITS_REQUIRE_CONFIRMATION"
            ? "Confirm regeneration before replacing teacher-edited course-model fields."
            : code === "INVALID_COURSE_MODEL_PATCH"
              ? "This correction is invalid for the current course model."
              : "Course-model synthesis could not be completed. Please retry.",
    );
  }
}

export interface CourseAnalysisRepository {
  listForProject(projectId: string): Promise<CourseAnalysisRecord[]>;
}

export type CourseAnalysisRecord = {
  analysis: DocumentAnalysis;
  analysisProfile: string;
  createdAt: Date;
};

export function getCourseAnalysisRepository(): CourseAnalysisRepository {
  if (isFixtureRuntime()) {
    return {
      async listForProject(projectId) {
        return getFixtureCourseAnalysisRecords(projectId);
      },
    };
  }
  const db = getDb();
  return {
    async listForProject(projectId) {
      const records = await db.documentAnalysis.findMany({
        where: { projectId, schemaVersion: "0.1" },
        orderBy: { createdAt: "desc" },
        select: { artifact: true, analysisProfile: true, createdAt: true },
      });
      return records.map(({ artifact, analysisProfile, createdAt }) => ({
        analysis: DocumentAnalysisSchema.parse(artifact),
        analysisProfile,
        createdAt,
      }));
    },
  };
}

type Dependencies = {
  sourceRepository: SourceRepository;
  projectRepository: ProjectRepository;
  analysisRepository: CourseAnalysisRepository;
  courseModelRepository: CourseModelRepository;
  synthesizer: CourseSynthesizer;
  now: () => Date;
};

function dependencies(overrides?: Partial<Dependencies>): Dependencies {
  return {
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    projectRepository: overrides?.projectRepository ?? getProjectRepository(),
    analysisRepository:
      overrides?.analysisRepository ?? getCourseAnalysisRepository(),
    courseModelRepository:
      overrides?.courseModelRepository ?? getCourseModelRepository(),
    synthesizer: overrides?.synthesizer ?? getCourseSynthesizer(),
    now: overrides?.now ?? (() => new Date()),
  };
}

function expectedMissingMaterialTypes(sources: SourceDocument[]): string[] {
  const roles = new Set(sources.map(({ role }) => role));
  return ["syllabus", "rubric", "solution"].filter(
    (role) => !roles.has(role as SourceDocument["role"]),
  );
}

function buildCoverage(
  sources: SourceDocument[],
  analysisByDocumentId: Map<string, DocumentAnalysis>,
) {
  const eligible = sources;
  const analyzed = eligible.filter((source) =>
    analysisByDocumentId.has(source.id),
  );
  const failed = eligible.filter(
    (source) => source.processing.analysisStatus === "failed",
  );
  const documentCount = eligible.length;
  const analyzedCount = analyzed.length;
  const failedCount = failed.length;
  const knownPageCounts = eligible.map(
    ({ processing }) => processing.pageCount,
  );
  return {
    documentCount,
    analyzedCount,
    failedCount,
    ...(knownPageCounts.every((value) => value !== undefined)
      ? { totalPages: knownPageCounts.reduce((sum, value) => sum + value!, 0) }
      : {}),
    analysisCompleteness:
      analyzedCount === documentCount && failedCount === 0
        ? ("complete" as const)
        : ("partial" as const),
    missingMaterialTypes: expectedMissingMaterialTypes(eligible),
  };
}

function buildWarnings(
  coverage: ReturnType<typeof buildCoverage>,
): CourseModel["warnings"] {
  const warnings: CourseModel["warnings"] = [];
  if (coverage.analysisCompleteness === "partial") {
    warnings.push({
      id: "warning-partial-analysis",
      code: "partial_analysis",
      message:
        "Some course materials are not yet analyzed; this course model is partial.",
      severity: "warning",
      evidence: [],
    });
  }
  for (const type of coverage.missingMaterialTypes) {
    warnings.push({
      id: `warning-missing-${type}`,
      code: `missing-${type}`,
      message: `No ${type.replace("_", " ")} material was supplied; related guidance is inferred from available evidence.`,
      severity: type === "rubric" || type === "solution" ? "warning" : "info",
      evidence: [],
    });
  }
  return warnings;
}

function sourceManifest(
  sources: SourceDocument[],
  analysisByDocumentId: Map<string, DocumentAnalysis>,
): CourseModel["sourceManifest"] {
  return sources
    .flatMap((source) => {
      const analysis = analysisByDocumentId.get(source.id);
      return analysis
        ? [
            {
              id: `source-${source.id}`,
              documentId: source.id,
              documentAnalysisId: analysis.id,
              name: source.name,
              role: source.role,
              authority: source.authority,
            },
          ]
        : [];
    });
}

function synthesisMode(
  analyses: DocumentAnalysis[],
): "direct" | "category_reduced" {
  return JSON.stringify(analyses).length > COURSE_SYNTHESIS_DIRECT_INPUT_LIMIT
    ? "category_reduced"
    : "direct";
}

export function selectCurrentDocumentAnalyses(
  records: CourseAnalysisRecord[],
): DocumentAnalysis[] {
  const selected = new Map<string, CourseAnalysisRecord>();
  for (const record of records) {
    if (record.analysisProfile !== COURSE_SYNTHESIS_PROFILE) continue;
    const current = selected.get(record.analysis.documentId);
    if (
      !current ||
      record.createdAt > current.createdAt ||
      (record.createdAt.getTime() === current.createdAt.getTime() &&
        record.analysis.id.localeCompare(current.analysis.id) > 0)
    ) {
      selected.set(record.analysis.documentId, record);
    }
  }
  return [...selected.values()]
    .sort((left, right) =>
      left.analysis.documentId.localeCompare(right.analysis.documentId),
    )
    .map(({ analysis }) => analysis);
}

function synthesisInput(
  projectId: string,
  version: number,
  sources: SourceDocument[],
  analyses: DocumentAnalysis[],
  teacherDecisions: TeacherDecision[],
  teachingBrief: Record<string, unknown>,
  now: Date,
): CourseSynthesisPromptInput {
  const analysisByDocumentId = new Map(
    analyses.map((analysis) => [analysis.documentId, analysis]),
  );
  const coverage = buildCoverage(sources, analysisByDocumentId);
  return {
    projectId,
    version,
    generatedAt: now.toISOString(),
    teachingBrief,
    sources,
    analyses,
    sourceManifest: sourceManifest(sources, analysisByDocumentId),
    coverage,
    teacherDecisions,
    mode: synthesisMode(analyses),
  };
}

function enforceEnvelope(
  output: unknown,
  input: CourseSynthesisPromptInput,
): CourseModel {
  const model = parseSynthesizedCourseModel(output);
  const expected = {
    schemaVersion: COURSE_MODEL_SCHEMA_VERSION,
    projectId: input.projectId,
    version: input.version,
    coverage: input.coverage,
    sourceManifest: input.sourceManifest,
    teacherDecisions: input.teacherDecisions,
    generatedAt: input.generatedAt,
  };
  if (
    JSON.stringify({
      schemaVersion: model.schemaVersion,
      projectId: model.projectId,
      version: model.version,
      coverage: model.coverage,
      sourceManifest: model.sourceManifest,
      teacherDecisions: model.teacherDecisions,
      generatedAt: model.generatedAt,
    }) !== JSON.stringify(expected)
  ) {
    throw new CourseSynthesisError("INVALID_SYNTHESIS");
  }
  return model;
}

export type SynthesizeCourseModelOptions = { discardTeacherEdits?: boolean };

export async function synthesizeCourseModel(
  projectId: string,
  options?: SynthesizeCourseModelOptions,
  overrides?: Partial<Dependencies>,
): Promise<CourseModelVersionRecord> {
  const deps = dependencies(overrides);
  const [project, sources, analysisRecords, latest] = await Promise.all([
    deps.projectRepository.findById(projectId),
    deps.sourceRepository.list(projectId),
    deps.analysisRepository.listForProject(projectId),
    deps.courseModelRepository.findLatest(projectId),
  ]);
  if (!project) throw new CourseSynthesisError("NO_ANALYSES");
  const enabledIds = new Set(sources.map(({ id }) => id));
  const validAnalyses = selectCurrentDocumentAnalyses(analysisRecords).filter(
    (analysis) => enabledIds.has(analysis.documentId),
  );
  if (validAnalyses.length === 0) throw new CourseSynthesisError("NO_ANALYSES");
  const input = synthesisInput(
    projectId,
    (latest?.version ?? 0) + 1,
    sources,
    validAnalyses,
    latest?.artifact.teacherDecisions ?? [],
    project.teachingBrief,
    deps.now(),
  );
  try {
    let model: CourseModel;
    const first = await deps.synthesizer.synthesize(input);
    try {
      model = enforceEnvelope(first, input);
    } catch {
      model = enforceEnvelope(
        await deps.synthesizer.repair(input, first),
        input,
      );
    }
    const generatedWarnings = buildWarnings(
      input.coverage as ReturnType<typeof buildCoverage>,
    );
    const warningById = new Map(
      [...model.warnings, ...generatedWarnings].map((warning) => [
        warning.id,
        warning,
      ]),
    );
    return deps.courseModelRepository.create({
      projectId,
      artifact: { ...model, warnings: [...warningById.values()] },
      teacherEdited: false,
      expectedVersion: latest?.version ?? 0,
      discardTeacherEdits: options?.discardTeacherEdits,
    });
  } catch (error) {
    console.error("Course-model synthesis failed", { projectId, error });
    if (
      error instanceof CourseModelVersionConflict ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "STALE" ||
          error.code === "TEACHER_EDITS_REQUIRE_CONFIRMATION"))
    ) {
      throw new CourseSynthesisError(
        error.code === "STALE"
          ? "STALE_COURSE_MODEL"
          : "TEACHER_EDITS_REQUIRE_CONFIRMATION",
      );
    }
    if (error instanceof CourseSynthesisError) throw error;
    throw new CourseSynthesisError("INVALID_SYNTHESIS");
  }
}

function applyOperation(
  model: CourseModel,
  operation: CourseModelPatchOperation,
): void {
  if (operation.operation === "update_concept") {
    const item = model.concepts.find(({ id }) => id === operation.id);
    if (!item) throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
    if (operation.name !== undefined) item.name = operation.name;
    if (operation.description !== undefined)
      item.description = operation.description;
  } else if (operation.operation === "update_learning_objective") {
    const item = model.learningObjectives.find(({ id }) => id === operation.id);
    if (!item) throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
    item.statement = operation.statement;
  } else if (operation.operation === "update_misconception") {
    const item = model.misconceptions.find(({ id }) => id === operation.id);
    if (!item) throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
    if (operation.statement !== undefined) item.statement = operation.statement;
    if (operation.correction !== undefined)
      item.correction = operation.correction;
  } else {
    const item = model.pedagogicalEvidence.find(
      ({ id }) => id === operation.id,
    );
    if (!item) throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
    item.status = operation.status;
  }
}

function teacherDecisions(
  operations: CourseModelPatchOperation[],
  now: string,
): TeacherDecision[] {
  return operations.map((operation, index) => ({
    id: `teacher-decision-${createHash("sha256").update(`${operation.operation}:${operation.id}:${index}:${now}`).digest("hex").slice(0, 24)}`,
    fieldPath: `/${operation.operation}/${operation.id}`,
    decision: "Teacher correction applied.",
    decidedAt: now,
  }));
}

export async function saveTeacherCourseModelRevision(
  projectId: string,
  patchInput: unknown,
  overrides?: Partial<Dependencies>,
): Promise<CourseModelVersionRecord> {
  const deps = dependencies(overrides);
  let patch: CourseModelPatch;
  try {
    patch = CourseModelPatchSchema.parse(patchInput);
  } catch {
    throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
  }
  if (patch.projectId !== projectId)
    throw new CourseSynthesisError("INVALID_COURSE_MODEL_PATCH");
  const now = deps.now().toISOString();
  try {
    return await deps.courseModelRepository.saveTeacherRevision({
      projectId,
      expectedVersion: patch.baseVersion,
      operations: patch.operations,
      decidedAt: now,
    });
  } catch (error) {
    if (
      error instanceof CourseModelVersionConflict ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "STALE")
    )
      throw new CourseSynthesisError("STALE_COURSE_MODEL");
    throw error;
  }
}

export function courseSynthesisCacheKey(analyses: DocumentAnalysis[]): string {
  const hash = createHash("sha256");
  hash.update(COURSE_SYNTHESIS_PROFILE);
  for (const analysis of [...analyses].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    hash.update(analysis.id);
    hash.update(analysis.documentHash);
  }
  return `synthesis-${hash.digest("hex")}`;
}
