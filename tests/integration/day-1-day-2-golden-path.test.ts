import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseSynthesizer } from "@/lib/ai/course-synthesizer";
import type { DocumentAnalyst } from "@/lib/ai/document-analyst";
import type { OpenAIFileProvider } from "@/lib/ai/openai-files";
import {
  saveTeacherCourseModelRevision,
  synthesizeCourseModel,
  type CourseModelRepository,
} from "@/lib/analysis/course-synthesis";
import {
  analyzePendingDocuments,
  type DocumentAnalysisRepository,
} from "@/lib/analysis/document-analysis";
import type { PipelineJobRepository } from "@/lib/jobs/repository";
import { createProject, saveTeachingBrief } from "@/lib/projects/service";
import type {
  ProjectRecord,
  ProjectRepository,
} from "@/lib/projects/repository";
import { ingestSource } from "@/lib/sources/ingestion";
import type {
  ProviderSourceDocument,
  SourceRepository,
} from "@/lib/sources/repository";
import type {
  CourseModel,
  DocumentAnalysis,
  PipelineJob,
  SourceDocument,
} from "@/lib/schemas";

vi.mock("server-only", () => ({}));

const projectId = "project-golden";
const permissions = {
  useForCourseModel: true,
  useForPedagogyDrafting: true,
  useForRuntimeRetrieval: false,
  useForEvaluation: true,
  revealExcerptsToStudents: false,
};

function projectRepository(): ProjectRepository {
  let project: ProjectRecord | null = null;
  let tokenHash = "";
  let vectorStoreId: string | null = null;

  return {
    create: vi.fn(async (input) => {
      tokenHash = input.editTokenHash;
      project = {
        id: projectId,
        name: input.name,
        stage: input.stage,
        teachingBrief: input.teachingBrief,
        createdAt: new Date("2026-07-15T12:00:00.000Z"),
        updatedAt: new Date("2026-07-15T12:00:00.000Z"),
      };
      return project;
    }),
    findById: vi.fn(async (id) => (id === projectId ? project : null)),
    findByIdAndEditTokenHash: vi.fn(async (id, hash) =>
      id === projectId && hash === tokenHash ? project : null,
    ),
    findByEditTokenHash: vi.fn(async (hash) =>
      hash === tokenHash ? project : null,
    ),
    updateTeachingBrief: vi.fn(async (id, patch) => {
      if (id !== projectId || !project) throw new Error("Project not found");
      project = {
        ...project,
        teachingBrief: { ...project.teachingBrief, ...patch },
        updatedAt: new Date("2026-07-15T12:01:00.000Z"),
      };
      return project;
    }),
    updateStage: vi.fn(async (id, stage) => {
      if (id !== projectId || !project) throw new Error("Project not found");
      project = { ...project, stage, updatedAt: new Date() };
      return project;
    }),
    findVectorStoreId: vi.fn(async () => vectorStoreId),
    claimVectorStoreId: vi.fn(async (_id, candidate) => {
      vectorStoreId ??= candidate;
      return vectorStoreId ?? candidate;
    }),
    acquireVectorStoreProvisioning: vi.fn(async () => ({
      vectorStoreId,
      acquired: vectorStoreId === null,
    })),
    completeVectorStoreProvisioning: vi.fn(async (_id, _token, candidate) => {
      vectorStoreId ??= candidate;
      return vectorStoreId;
    }),
    releaseVectorStoreProvisioning: vi.fn(async () => undefined),
  };
}

function sourceRepository(): {
  repository: SourceRepository;
  documents: ProviderSourceDocument[];
} {
  const documents: ProviderSourceDocument[] = [];
  const repository = {
    getWorkspaceUsage: vi.fn(async () => ({
      fileCount: documents.length,
      workspaceBytes: documents.reduce(
        (total, item) => total + item.source.sizeBytes,
        0,
      ),
      pageCount: documents.reduce(
        (total, item) => total + (item.source.processing.pageCount ?? 0),
        0,
      ),
      extractedTokenCount: documents.reduce(
        (total, item) =>
          total + (item.source.processing.extractedTokenCount ?? 0),
        0,
      ),
      unknownPageCount: documents.filter(
        (item) => item.source.processing.pageCount === undefined,
      ).length,
      unknownExtractedTokenCount: documents.filter(
        (item) => item.source.processing.extractedTokenCount === undefined,
      ).length,
      contentHashes: documents.map((item) => item.source.contentHash),
    })),
    create: vi.fn(async (source: SourceDocument) => {
      documents.push({ source, openaiFileId: null });
      return source;
    }),
    recordExtractionMetrics: vi.fn(async (_projectId, sourceId, metrics) => {
      const record = documents.find((item) => item.source.id === sourceId);
      if (!record) throw new Error("Source not found");
      record.source = {
        ...record.source,
        processing: {
          ...record.source.processing,
          ...(metrics.pageCount === undefined ? {} : { pageCount: metrics.pageCount }),
          extractedTokenCount: metrics.extractedTokenCount,
          extractionStatus: metrics.finalized
            ? "ready"
            : record.source.processing.extractionStatus,
          requiresExtractionMetrics: metrics.requiresExtractionMetrics,
        },
      };
      return record.source;
    }),
    findById: vi.fn(
      async (_projectId, sourceId) =>
        documents.find((item) => item.source.id === sourceId) ?? null,
    ),
    findBySourceId: vi.fn(
      async (sourceId) =>
        documents.find((item) => item.source.id === sourceId) ?? null,
    ),
    list: vi.fn(async () => documents.map((item) => item.source)),
    updateIngestion: vi.fn(async (_projectId, sourceId, update) => {
      const record = documents.find((item) => item.source.id === sourceId);
      if (!record) throw new Error("Source not found");
      const processing = {
        ...record.source.processing,
        ...update,
      } as SourceDocument["processing"];
      if (update.processingError === null) delete processing.error;
      if (
        update.processingError !== undefined &&
        update.processingError !== null
      ) {
        processing.error = update.processingError;
      }
      record.source = { ...record.source, processing };
      if (update.openaiFileId !== undefined)
        record.openaiFileId = update.openaiFileId;
      return record;
    }),
    delete: vi.fn(async () => undefined),
  } satisfies SourceRepository;
  return { repository, documents };
}

function documentAnalysis(
  input: Parameters<DocumentAnalyst["analyze"]>[0],
): DocumentAnalysis {
  const evidence = [
    {
      documentId: input.source.id,
      documentAnalysisId: input.analysisId,
      excerptId: "fixture-excerpt",
      locatorLabel: "Fixture evidence",
    },
  ];
  return {
    schemaVersion: "0.1",
    id: input.analysisId,
    projectId: input.source.projectId,
    documentId: input.source.id,
    documentHash: input.source.contentHash,
    classification: { role: input.source.role, confidence: 0.95 },
    coverage: { extractionWarnings: [] },
    findings: {
      topics: [
        {
          id: `topic-${input.source.id}`,
          label: "Probability",
          description: "Probability evidence.",
          provenance: "source_grounded",
          evidence,
          confidence: 0.95,
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
  };
}

function courseModel(
  input: Parameters<CourseSynthesizer["synthesize"]>[0],
): CourseModel {
  const evidence = input.analyses.map((analysis) => ({
    documentId: analysis.documentId,
    documentAnalysisId: analysis.id,
    excerptId: "fixture-excerpt",
    locatorLabel: "Fixture evidence",
  }));
  return {
    schemaVersion: "0.2",
    projectId: input.projectId,
    version: input.version,
    coverage: input.coverage,
    courseIdentity: {
      id: "course-fixture",
      title: "Probability fixture course",
      subject: "Mathematics",
      topic: "Probability",
      studentLevel: "First year",
      language: "English",
      description: "Compact fixture synthesis.",
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
        correction: "They describe different relationships.",
        provenance: "source_grounded",
        evidence,
      },
    ],
    contentBoundaries: [],
    pedagogicalEvidence: [
      {
        id: "observation-reasoning",
        observation: "reasoning_before_calculation",
        description: "The fixture materials ask for working.",
        suggestedPolicyEffects: [],
        confidence: 0.9,
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

describe("Day 1–2 fixture golden path", () => {
  beforeEach(() => {
    vi.stubEnv(
      "PROJECT_EDIT_TOKEN_SECRET",
      "fixture-secret-for-day-one-day-two",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a project, persists its brief, indexes three fixture sources, analyzes and synthesizes them, then saves an immutable correction", async () => {
    const projects = projectRepository();
    const created = await createProject(
      { name: "Probability workshop" },
      projects,
    );
    expect(created.project).toMatchObject({ id: projectId, stage: "brief" });
    await saveTeachingBrief(
      projectId,
      {
        context: {
          subject: "Mathematics",
          topic: "Probability",
          studentLevel: "First year",
          language: "English",
        },
        purpose: "exam_preparation",
        objectives: ["Explain independent events"],
        assistanceBoundaries: {
          defaultDisclosure: "reveal_after_sufficient_attempts",
          assessedWorkDisclosure: "never_reveal",
          requireReasoningBeforeAnswer: true,
        },
        style: {
          tone: "encouraging",
          responseLength: "balanced",
          questioningPreference: "questions_first",
          learnerSupports: ["step_by_step"],
        },
        completedSteps: [
          "context",
          "purpose",
          "objectives",
          "assistance",
          "style",
        ],
      },
      projects,
    );

    const sources = sourceRepository();
    let fileNumber = 0;
    const provider: OpenAIFileProvider = {
      createVectorStore: vi.fn().mockResolvedValue({ id: "vs-fixture" }),
      deleteVectorStore: vi.fn().mockResolvedValue(undefined),
      uploadFile: vi.fn(async () => ({ id: `file-fixture-${++fileNumber}` })),
      attachFile: vi.fn().mockResolvedValue(undefined),
      getFileStatus: vi.fn().mockResolvedValue({ status: "completed" }),
      getExtractedText: vi.fn(async (_vectorStoreId, fileId) =>
        fileId === "file-fixture-3"
          ? "PRIVATE MARKING SCHEME ANSWER CONTENT\f"
          : "fixture extracted probability content\f",
      ),
      detachFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };
    for (const file of [
      ["practice-exercise.md", "exercise"],
      ["sample-exam.md", "assessment"],
      ["marking-scheme.md", "rubric"],
    ] as const) {
      await ingestSource(
        projectId,
        {
          name: file[0],
          mimeType: "text/markdown",
          bytes: new TextEncoder().encode(file[0]),
        },
        {
          role: file[1],
          authority: "course_authoritative",
          permissions,
          containsProtectedSolutions: file[1] === "rubric",
        },
        {
          sourceRepository: sources.repository,
          projectRepository: projects,
          provider,
          wait: vi.fn().mockResolvedValue(undefined),
          maxPollAttempts: 1,
          pollDelayMs: 0,
        },
      );
    }
    expect(sources.documents).toHaveLength(3);
    expect(
      sources.documents.every(
        (item) => item.source.processing.extractionStatus === "ready",
      ),
    ).toBe(true);
    expect(
      sources.documents.find((item) => item.source.name === "marking-scheme.md")
        ?.source,
    ).toMatchObject({
      containsProtectedSolutions: true,
      permissions: {
        useForRuntimeRetrieval: false,
        revealExcerptsToStudents: false,
      },
    });

    const analyses = new Map<string, DocumentAnalysis>();
    const analysisRepository: DocumentAnalysisRepository = {
      findCached: vi.fn(
        async (input) =>
          analyses.get(`${input.documentHash}:${input.analysisProfile}`) ??
          null,
      ),
      save: vi.fn(async (analysis) => {
        analyses.set(
          `${analysis.documentHash}:${analysis.analysisProfile}`,
          analysis,
        );
        return analysis;
      }),
    };
    let job: PipelineJob | null = null;
    const jobs: PipelineJobRepository = {
      start: vi.fn(async (input) => {
        job = {
          schemaVersion: "0.1",
          id: input.id,
          projectId: input.projectId,
          stage: "analysis",
          idempotencyKey: input.idempotencyKey,
          status: "running",
          attemptCount: 1,
          progress: 0,
          startedAt: "2026-07-15T12:02:00.000Z",
        };
        return { job, shouldRun: true };
      }),
      updateProgress: vi.fn(async (_id, progress) => ({ ...job!, progress })),
      complete: vi.fn(async (_id, resultId) => ({
        ...job!,
        status: "completed" as const,
        progress: 1,
        ...(resultId ? { resultId } : {}),
      })),
      fail: vi.fn(),
      findById: vi.fn(),
    };
    const analyst: DocumentAnalyst = {
      analyze: vi.fn(async (input) => documentAnalysis(input)),
      repair: vi.fn(async (input) => documentAnalysis(input)),
    };
    const analysisJob = await analyzePendingDocuments(projectId, undefined, {
      sourceRepository: sources.repository,
      analysisRepository,
      projectRepository: projects,
      analyst,
      jobRepository: jobs,
      now: () => new Date("2026-07-15T12:02:00.000Z"),
    });
    expect(analysisJob.status).toBe("completed");
    expect(analyses).toHaveLength(3);

    const versions: Array<{
      id: string;
      projectId: string;
      version: number;
      artifact: CourseModel;
      teacherEdited: boolean;
      createdAt: Date;
    }> = [];
    const courseModels: CourseModelRepository = {
      findLatest: vi.fn(async () => versions.at(-1) ?? null),
      create: vi.fn(async (input) => {
        const record = {
          id: `version-${versions.length + 1}`,
          projectId: input.projectId,
          version: versions.length + 1,
          artifact: { ...input.artifact, version: versions.length + 1 },
          teacherEdited: input.teacherEdited,
          createdAt: new Date("2026-07-15T12:03:00.000Z"),
        };
        versions.push(record);
        return record;
      }),
      saveTeacherRevision: vi.fn(async (input) => {
        const previous = versions.at(-1)!;
        const artifact = structuredClone(previous.artifact);
        artifact.concepts[0]!.description =
          input.operations[0]?.operation === "update_concept"
            ? (input.operations[0].description ??
              artifact.concepts[0]!.description)
            : artifact.concepts[0]!.description;
        const record = {
          ...previous,
          id: `version-${versions.length + 1}`,
          version: previous.version + 1,
          artifact: { ...artifact, version: previous.version + 1 },
          teacherEdited: true,
          createdAt: new Date("2026-07-15T12:04:00.000Z"),
        };
        versions.push(record);
        return record;
      }),
    };
    const synthesizer: CourseSynthesizer = {
      synthesize: vi.fn(async (input) => courseModel(input)),
      repair: vi.fn(async (input) => courseModel(input)),
    };
    const synthesized = await synthesizeCourseModel(projectId, undefined, {
      sourceRepository: sources.repository,
      projectRepository: projects,
      analysisRepository: {
        listForProject: vi.fn(async () =>
          [...analyses.values()].map((analysis) => ({
            analysis,
            analysisProfile: "course-model-v2-vision",
            createdAt: new Date("2026-07-15T12:03:00.000Z"),
          })),
        ),
      },
      courseModelRepository: courseModels,
      synthesizer,
      now: () => new Date("2026-07-15T12:03:00.000Z"),
    });
    const revised = await saveTeacherCourseModelRevision(
      projectId,
      {
        schemaVersion: "0.1",
        projectId,
        baseVersion: 1,
        operations: [
          {
            operation: "update_concept",
            id: "concept-independence",
            description: "Teacher-approved explanation.",
          },
        ],
      },
      {
        courseModelRepository: courseModels,
        sourceRepository: sources.repository,
        projectRepository: projects,
        analysisRepository: {
          listForProject: vi.fn(),
        },
        synthesizer,
        now: () => new Date("2026-07-15T12:04:00.000Z"),
      },
    );

    expect(synthesized.artifact.coverage).toMatchObject({
      documentCount: 3,
      analyzedCount: 3,
      analysisCompleteness: "complete",
    });
    expect(synthesized.artifact.sourceManifest).toHaveLength(3);
    const synthesisInput = (synthesizer.synthesize as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(JSON.stringify(synthesisInput)).not.toContain(
      "PRIVATE MARKING SCHEME ANSWER CONTENT",
    );
    expect(JSON.stringify(synthesized.artifact)).not.toContain(
      "PRIVATE MARKING SCHEME ANSWER CONTENT",
    );
    expect(revised).toMatchObject({ version: 2, teacherEdited: true });
    expect(revised.artifact.concepts[0]?.description).toBe(
      "Teacher-approved explanation.",
    );
    expect(versions[0]?.artifact.concepts[0]?.description).toBe(
      "Events whose probabilities factor.",
    );
  });
});
