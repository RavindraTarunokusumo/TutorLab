import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CourseSynthesisPromptInput } from "@/lib/ai/prompts/course-synthesizer";
import type { CourseSynthesizer } from "@/lib/ai/course-synthesizer";
import type { DocumentAnalyst } from "@/lib/ai/document-analyst";
import type { OpenAIFileProvider } from "@/lib/ai/openai-files";
import type {
  CourseAnalysisRecord,
  CourseModelRepository,
  CourseModelVersionRecord,
} from "@/lib/analysis/course-synthesis";
import type { DocumentAnalysisRepository } from "@/lib/analysis/document-analysis";
import type { PipelineJobRepository } from "@/lib/jobs/repository";
import type {
  ProjectRecord,
  ProjectRepository,
} from "@/lib/projects/repository";
import type {
  ProviderSourceDocument,
  SourceExtractionMetrics,
  SourceIngestionUpdate,
  SourceRepository,
} from "@/lib/sources/repository";
import type {
  CourseModel,
  DocumentAnalysis,
  PipelineJob,
  SourceDocument,
  TeachingBriefPatch,
} from "@/lib/schemas";

export function isFixtureRuntime(): boolean {
  return process.env.TUTORLAB_FIXTURE_MODE === "1";
}

type FixtureState = {
  projects: Map<
    string,
    ProjectRecord & { editTokenHash: string; vectorStoreId: string | null }
  >;
  sources: Map<string, ProviderSourceDocument>;
  analyses: Map<string, DocumentAnalysis & { analysisProfile: string }>;
  jobs: Map<string, PipelineJob>;
  versions: Map<string, CourseModelVersionRecord[]>;
  files: Map<string, string>;
};

const state: FixtureState = {
  projects: new Map(),
  sources: new Map(),
  analyses: new Map(),
  jobs: new Map(),
  versions: new Map(),
  files: new Map(),
};
const { projects, sources, analyses, jobs, versions, files } = state;

type SerializedFixtureState = {
  projects: Array<
    [
      string,
      Omit<ProjectRecord, "createdAt" | "updatedAt"> & {
        createdAt: string;
        updatedAt: string;
        editTokenHash: string;
        vectorStoreId: string | null;
      },
    ]
  >;
  sources: Array<[string, ProviderSourceDocument]>;
  analyses: Array<[string, DocumentAnalysis & { analysisProfile: string }]>;
  jobs: Array<[string, PipelineJob]>;
  versions: Array<
    [
      string,
      Array<
        Omit<CourseModelVersionRecord, "createdAt"> & { createdAt: string }
      >,
    ]
  >;
  files: Array<[string, string]>;
};

function statePath(): string | null {
  const path = process.env.TUTORLAB_FIXTURE_STATE_PATH;
  return path ? resolve(path) : null;
}

function refreshState(): void {
  const path = statePath();
  projects.clear();
  sources.clear();
  analyses.clear();
  jobs.clear();
  versions.clear();
  files.clear();
  if (!path || !existsSync(path)) return;
  const saved = JSON.parse(
    readFileSync(path, "utf8"),
  ) as SerializedFixtureState;
  for (const [id, project] of saved.projects) {
    projects.set(id, {
      ...project,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
    });
  }
  for (const [id, source] of saved.sources) sources.set(id, source);
  for (const [id, analysis] of saved.analyses) analyses.set(id, analysis);
  for (const [id, job] of saved.jobs) jobs.set(id, job);
  for (const [id, records] of saved.versions) {
    versions.set(
      id,
      records.map((record) => ({
        ...record,
        createdAt: new Date(record.createdAt),
      })),
    );
  }
  for (const [id, content] of saved.files) files.set(id, content);
}

function persistState(): void {
  const path = statePath();
  if (!path) return;
  const saved: SerializedFixtureState = {
    projects: [...projects.entries()].map(([id, project]) => [
      id,
      {
        ...project,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    ]),
    sources: [...sources.entries()],
    analyses: [...analyses.entries()],
    jobs: [...jobs.entries()],
    versions: [...versions.entries()].map(([id, records]) => [
      id,
      records.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
      })),
    ]),
    files: [...files.entries()],
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(saved), { encoding: "utf8" });
}

function sourceList(projectId: string): ProviderSourceDocument[] {
  return [...sources.values()].filter(
    (record) => record.source.projectId === projectId,
  );
}

function fixtureEvidence(input: {
  source: SourceDocument;
  analysisId: string;
}) {
  return [
    {
      documentId: input.source.id,
      documentAnalysisId: input.analysisId,
      excerptId: "fixture-excerpt",
      locatorLabel: "Fixture source",
    },
  ];
}

export function getFixtureProjectRepository(): ProjectRepository {
  refreshState();
  return {
    async create(input) {
      const project: ProjectRecord & {
        editTokenHash: string;
        vectorStoreId: string | null;
      } = {
        id: input.id,
        name: input.name,
        stage: "course_model",
        teachingBrief: input.teachingBrief,
        editTokenHash: input.editTokenHash,
        vectorStoreId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      projects.set(project.id, project);
      persistState();
      return project;
    },
    async findById(id) {
      return projects.get(id) ?? null;
    },
    async findByIdAndEditTokenHash(id, hash) {
      const project = projects.get(id);
      return project?.editTokenHash === hash ? project : null;
    },
    async updateTeachingBrief(id, patch) {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found");
      project.teachingBrief = {
        ...project.teachingBrief,
        ...patch,
      } as TeachingBriefPatch;
      project.updatedAt = new Date();
      persistState();
      return project;
    },
    async findVectorStoreId(id) {
      return projects.get(id)?.vectorStoreId ?? null;
    },
    async claimVectorStoreId(id, candidate) {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found");
      project.vectorStoreId ??= candidate;
      persistState();
      return project.vectorStoreId;
    },
    async acquireVectorStoreProvisioning(id) {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found");
      return {
        vectorStoreId: project.vectorStoreId,
        acquired: project.vectorStoreId === null,
      };
    },
    async completeVectorStoreProvisioning(id, _token, candidate) {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found");
      project.vectorStoreId ??= candidate;
      persistState();
      return project.vectorStoreId;
    },
    async releaseVectorStoreProvisioning() {},
  };
}

export function getFixtureSourceRepository(): SourceRepository {
  refreshState();
  return {
    async getWorkspaceUsage(projectId) {
      const current = sourceList(projectId);
      return {
        fileCount: current.length,
        workspaceBytes: current.reduce(
          (total, item) => total + item.source.sizeBytes,
          0,
        ),
        pageCount: current.reduce(
          (total, item) => total + (item.source.processing.pageCount ?? 0),
          0,
        ),
        extractedTokenCount: current.reduce(
          (total, item) =>
            total + (item.source.processing.extractedTokenCount ?? 0),
          0,
        ),
        unknownPageCount: current.filter(
          (item) => item.source.processing.pageCount === undefined,
        ).length,
        unknownExtractedTokenCount: current.filter(
          (item) => item.source.processing.extractedTokenCount === undefined,
        ).length,
        contentHashes: current.map((item) => item.source.contentHash),
      };
    },
    async create(source) {
      sources.set(source.id, { source, openaiFileId: null });
      persistState();
      return source;
    },
    async recordExtractionMetrics(
      _projectId,
      sourceId,
      metrics: SourceExtractionMetrics,
    ) {
      const record = sources.get(sourceId);
      if (!record) throw new Error("Source not found");
      record.source = {
        ...record.source,
        processing: {
          ...record.source.processing,
          ...(metrics.pageCount === undefined
            ? {}
            : { pageCount: metrics.pageCount }),
          ...(metrics.extractedTokenCount === undefined
            ? {}
            : { extractedTokenCount: metrics.extractedTokenCount }),
          ...(metrics.finalized ? { extractionStatus: "ready" } : {}),
          ...(metrics.requiresExtractionMetrics === undefined
            ? {}
            : { requiresExtractionMetrics: metrics.requiresExtractionMetrics }),
        },
      };
      persistState();
      return record.source;
    },
    async findById(projectId, sourceId) {
      const record = sources.get(sourceId);
      return record?.source.projectId === projectId ? record : null;
    },
    async findBySourceId(sourceId) {
      return sources.get(sourceId) ?? null;
    },
    async list(projectId) {
      return sourceList(projectId).map((record) => record.source);
    },
    async updateIngestion(projectId, sourceId, update: SourceIngestionUpdate) {
      const record = sources.get(sourceId);
      if (!record || record.source.projectId !== projectId)
        throw new Error("Source not found");
      const processing = {
        ...record.source.processing,
        ...(update.uploadStatus === undefined
          ? {}
          : { uploadStatus: update.uploadStatus }),
        ...(update.extractionStatus === undefined
          ? {}
          : { extractionStatus: update.extractionStatus }),
        ...(update.analysisStatus === undefined
          ? {}
          : { analysisStatus: update.analysisStatus }),
        ...(update.requiresExtractionMetrics === undefined
          ? {}
          : { requiresExtractionMetrics: update.requiresExtractionMetrics }),
      };
      if (update.processingError === null) delete processing.error;
      if (update.processingError) processing.error = update.processingError;
      record.source = { ...record.source, processing };
      if (update.openaiFileId !== undefined)
        record.openaiFileId = update.openaiFileId;
      persistState();
      return record;
    },
    async delete(projectId, sourceId) {
      const record = sources.get(sourceId);
      if (!record || record.source.projectId !== projectId)
        throw new Error("Source not found");
      sources.delete(sourceId);
      persistState();
    },
  };
}

export function getFixtureOpenAIFileProvider(): OpenAIFileProvider {
  refreshState();
  return {
    async createVectorStore() {
      return { id: "fixture-vector-store" };
    },
    async deleteVectorStore() {},
    async uploadFile(input) {
      const id = `fixture-file-${randomUUID()}`;
      files.set(id, new TextDecoder().decode(input.bytes));
      persistState();
      return { id };
    },
    async attachFile() {},
    async getFileStatus() {
      return { status: "completed" };
    },
    async getExtractedText(_vectorStoreId, fileId) {
      const content = files.get(fileId);
      return content === undefined ? undefined : `${content}\f`;
    },
    async detachFile() {},
    async deleteFile(fileId) {
      files.delete(fileId);
      persistState();
    },
  };
}

export function getFixtureDocumentAnalyst(): DocumentAnalyst {
  const analyze = async (input: Parameters<DocumentAnalyst["analyze"]>[0]) => ({
    schemaVersion: "0.1",
    id: input.analysisId,
    projectId: input.source.projectId,
    documentId: input.source.id,
    documentHash: input.source.contentHash,
    classification: { role: input.source.role, confidence: 1 },
    coverage: { extractionWarnings: [] },
    findings: {
      topics: [
        {
          id: `topic-${input.source.id}`,
          label: "Probability",
          description: "Fixture probability evidence.",
          provenance: "source_grounded",
          evidence: fixtureEvidence({
            source: input.source,
            analysisId: input.analysisId,
          }),
          confidence: 1,
        },
      ],
      objectives: [],
      terminology: [],
      acceptedMethods: [],
      exercises: [],
      assessmentCriteria: [],
      protectedSolutions: [],
      misconceptions: [],
      pedagogicalPatterns: [],
    },
    summary: `Fixture analysis for ${input.source.name}.`,
    analyzedAt: input.analyzedAt,
  });
  return { analyze, repair: async (input) => analyze(input) };
}

export function getFixtureDocumentAnalysisRepository(): DocumentAnalysisRepository {
  refreshState();
  return {
    async findCached(input) {
      return (
        [...analyses.values()].find(
          (analysis) =>
            analysis.projectId === input.projectId &&
            analysis.documentHash === input.documentHash &&
            analysis.analysisProfile === input.analysisProfile,
        ) ?? null
      );
    },
    async save(input) {
      analyses.set(input.id, input);
      persistState();
      return input;
    },
  };
}

export function getFixtureJobRepository(): PipelineJobRepository {
  refreshState();
  return {
    async start(input) {
      const existing = [...jobs.values()].find(
        (job) =>
          job.projectId === input.projectId &&
          job.idempotencyKey === input.idempotencyKey &&
          job.stage === input.stage,
      );
      if (existing?.status === "completed" || existing?.status === "running")
        return { job: existing, shouldRun: false };
      const job: PipelineJob = {
        schemaVersion: "0.1",
        id: input.id,
        projectId: input.projectId,
        ...(input.sourceDocumentId
          ? { sourceDocumentId: input.sourceDocumentId }
          : {}),
        stage: input.stage,
        idempotencyKey: input.idempotencyKey,
        status: "running",
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        progress: 0,
        startedAt: new Date().toISOString(),
      };
      jobs.set(job.id, job);
      persistState();
      return { job, shouldRun: true };
    },
    async updateProgress(id, progress) {
      const job = jobs.get(id)!;
      job.progress = progress;
      persistState();
      return job;
    },
    async complete(id, resultId) {
      const job = jobs.get(id)!;
      job.status = "completed";
      job.progress = 1;
      job.resultId = resultId;
      job.completedAt = new Date().toISOString();
      persistState();
      return job;
    },
    async fail(id, diagnostic) {
      const job = jobs.get(id)!;
      job.status = "failed";
      job.diagnostic = diagnostic;
      job.completedAt = new Date().toISOString();
      persistState();
      return job;
    },
    async findById(projectId, id) {
      const job = jobs.get(id);
      return job?.projectId === projectId ? job : null;
    },
  };
}

export function getFixtureCourseAnalysisRecords(
  projectId: string,
): CourseAnalysisRecord[] {
  refreshState();
  return [...analyses.values()]
    .filter((analysis) => analysis.projectId === projectId)
    .map((analysis) => ({
      analysis,
      analysisProfile: analysis.analysisProfile,
      createdAt: new Date(analysis.analyzedAt),
    }));
}

function fixtureCourseModel(input: CourseSynthesisPromptInput): CourseModel {
  const evidence = input.analyses.flatMap((analysis) =>
    fixtureEvidence({
      source: input.sources.find(
        (source) => source.id === analysis.documentId,
      )!,
      analysisId: analysis.id,
    }),
  );
  return {
    schemaVersion: "0.2",
    projectId: input.projectId,
    version: input.version,
    coverage: input.coverage,
    courseIdentity: {
      id: "fixture-course",
      title: "Probability workshop",
      subject: "Mathematics",
      topic: "Probability",
      studentLevel: "First year",
      language: "English",
      description: "Compact fixture course model.",
      provenance: "source_grounded",
      evidence,
    },
    structure: { units: [], prerequisiteRelations: [] },
    learningObjectives: [],
    concepts: [
      {
        id: "concept-independence",
        name: "Independent events",
        description: "Events whose probabilities factor.",
        unitIds: [],
        provenance: "source_grounded",
        evidence,
      },
    ],
    terminology: [],
    methods: [],
    exercises: [],
    assessments: [],
    rubricCriteria: [],
    protectedSolutions: [],
    misconceptions: [
      {
        id: "misconception-independence",
        statement: "Independent means mutually exclusive.",
        correction: "They are distinct probability relationships.",
        provenance: "source_grounded",
        evidence,
      },
    ],
    contentBoundaries: [],
    pedagogicalEvidence: [
      {
        id: "observation-reasoning",
        observation: "reasoning_before_calculation",
        description: "Fixture marking evidence emphasizes working.",
        suggestedPolicyEffects: [],
        confidence: 1,
        status: "proposed",
        provenance: "source_grounded",
        evidence,
      },
    ],
    conflicts: [],
    warnings: [],
    sourceManifest: input.sourceManifest,
    teacherDecisions: input.teacherDecisions,
    generatedAt: input.generatedAt,
  };
}

export function getFixtureCourseSynthesizer(): CourseSynthesizer {
  return {
    synthesize: async (input) => fixtureCourseModel(input),
    repair: async (input) => fixtureCourseModel(input),
  };
}

export function getFixtureCourseModelRepository(): CourseModelRepository {
  refreshState();
  return {
    async findLatest(projectId) {
      return versions.get(projectId)?.at(-1) ?? null;
    },
    async create(input) {
      const list = versions.get(input.projectId) ?? [];
      const version = list.length + 1;
      const record: CourseModelVersionRecord = {
        id: randomUUID(),
        projectId: input.projectId,
        version,
        artifact: { ...input.artifact, version },
        teacherEdited: input.teacherEdited,
        createdAt: new Date(),
      };
      versions.set(input.projectId, [...list, record]);
      persistState();
      return record;
    },
    async saveTeacherRevision(input) {
      const previous = versions.get(input.projectId)?.at(-1);
      if (!previous || previous.version !== input.expectedVersion)
        throw new Error("Stale version");
      const artifact = structuredClone(previous.artifact);
      for (const operation of input.operations) {
        if (operation.operation === "update_concept") {
          const concept = artifact.concepts.find(
            (item: CourseModel["concepts"][number]) => item.id === operation.id,
          );
          if (concept) {
            if (operation.name) concept.name = operation.name;
            if (operation.description)
              concept.description = operation.description;
          }
        }
      }
      artifact.version = previous.version + 1;
      artifact.generatedAt = input.decidedAt;
      artifact.teacherDecisions = [
        ...artifact.teacherDecisions,
        ...input.operations.map((operation, index) => ({
          id: `fixture-decision-${index}-${createHash("sha256").update(operation.id).digest("hex").slice(0, 8)}`,
          fieldPath: `/${operation.operation}/${operation.id}`,
          decision: "Fixture teacher correction.",
          decidedAt: input.decidedAt,
        })),
      ];
      const record: CourseModelVersionRecord = {
        id: randomUUID(),
        projectId: input.projectId,
        version: artifact.version,
        artifact,
        teacherEdited: true,
        createdAt: new Date(input.decidedAt),
      };
      versions.set(input.projectId, [
        ...(versions.get(input.projectId) ?? []),
        record,
      ]);
      persistState();
      return record;
    },
  };
}
