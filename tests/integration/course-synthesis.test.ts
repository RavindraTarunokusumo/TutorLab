import { describe, expect, it, vi } from "vitest";
import { CourseModelVersionConflict, CourseSynthesisError, saveTeacherCourseModelRevision, selectCurrentDocumentAnalyses, synthesizeCourseModel, type CourseModelRepository } from "@/lib/analysis/course-synthesis";
import type { CourseSynthesizer } from "@/lib/ai/course-synthesizer";
import { buildCourseSynthesizerInstructions, COURSE_SYNTHESIS_SERIALIZED_PROMPT_BUDGET, type CourseSynthesisPromptInput } from "@/lib/ai/prompts/course-synthesizer";
import type { ProjectRepository } from "@/lib/projects/repository";
import type { SourceRepository } from "@/lib/sources/repository";
import type { CourseModel, DocumentAnalysis, SourceDocument } from "@/lib/schemas";

vi.mock("server-only", () => ({}));

const permissions = { useForCourseModel: true, useForPedagogyDrafting: true, useForRuntimeRetrieval: false, useForEvaluation: true, revealExcerptsToStudents: false };

function source(id: string, role: SourceDocument["role"], analysisStatus: SourceDocument["processing"]["analysisStatus"] = "ready", enabled = true): SourceDocument {
  return {
    id, projectId: "project-alpha", name: `${id}.pdf`, role, authority: "course_authoritative", permissions: { ...permissions, useForCourseModel: enabled }, containsProtectedSolutions: false,
    contentHash: "a".repeat(64), mimeType: "application/pdf", sizeBytes: 12,
    processing: { uploadStatus: "ready", extractionStatus: "ready", analysisStatus, pageCount: 2, ...(analysisStatus === "failed" ? { error: "Analysis failed safely." } : {}) },
  };
}

function analysis(documentId = "exercise-alpha"): DocumentAnalysis {
  return {
    schemaVersion: "0.1", id: "analysis-alpha", projectId: "project-alpha", documentId, documentHash: "a".repeat(64), classification: { role: "exercise", confidence: 0.9 }, coverage: { pageCount: 2, analyzedPages: 2, extractionWarnings: [] },
    findings: { topics: [{ id: "topic-alpha", label: "Probability", description: "Probability relationships.", provenance: "source_grounded", evidence: [{ documentId, documentAnalysisId: "analysis-alpha", excerptId: "excerpt-alpha", locatorLabel: "Question one" }], confidence: 0.9 }], objectives: [], terminology: [], acceptedMethods: [], exercises: [], assessmentCriteria: [], protectedSolutions: [], misconceptions: [], pedagogicalPatterns: [] },
    summary: "Structured probability findings only.", analyzedAt: "2026-07-15T12:00:00.000Z",
  };
}

function modelFor(input: CourseSynthesisPromptInput): CourseModel {
  const evidence = [{ documentId: "exercise-alpha", documentAnalysisId: "analysis-alpha", excerptId: "excerpt-alpha", locatorLabel: "Question one" }];
  return {
    schemaVersion: "0.2", projectId: input.projectId, version: input.version, coverage: input.coverage,
    courseIdentity: { id: "course-alpha", title: "Probability", subject: "Mathematics", topic: "Events", studentLevel: "First year", language: "English", description: "Concise course model.", provenance: "source_grounded", evidence },
    structure: { units: [], prerequisiteRelations: [] }, learningObjectives: [], concepts: [{ id: "concept-alpha", name: "Independent events", description: "Events whose probabilities factor.", unitIds: [], provenance: "source_grounded", evidence }], terminology: [], methods: [], exercises: [], assessments: [], rubricCriteria: [], protectedSolutions: [], misconceptions: [{ id: "misconception-alpha", statement: "Independent means exclusive.", correction: "They are different relationships.", provenance: "source_grounded", evidence }], contentBoundaries: [], pedagogicalEvidence: [{ id: "observation-alpha", observation: "reasoning_before_calculation", description: "Reasoning is emphasized.", suggestedPolicyEffects: [], confidence: 0.9, status: "proposed", provenance: "source_grounded", evidence }], conflicts: [], warnings: [], sourceManifest: input.sourceManifest, teacherDecisions: input.teacherDecisions, generatedAt: input.generatedAt,
  };
}

function setup() {
  const sources = [source("exercise-alpha", "exercise"), source("rubric-alpha", "rubric", "failed"), source("private-alpha", "solution", "ready", false)];
  const versions: Array<Awaited<ReturnType<CourseModelRepository["create"]>>> = [];
  const courseModelRepository: CourseModelRepository = {
    findLatest: vi.fn(async () => versions.at(-1) ?? null),
    create: vi.fn(async ({ projectId, artifact, teacherEdited, expectedVersion, discardTeacherEdits }) => {
      if (expectedVersion !== versions.length) throw new CourseModelVersionConflict("STALE");
      if (versions.at(-1)?.teacherEdited && !discardTeacherEdits) throw new CourseModelVersionConflict("TEACHER_EDITS_REQUIRE_CONFIRMATION");
      const record = { id: `version-${versions.length + 1}`, projectId, version: versions.length + 1, artifact: { ...artifact, version: versions.length + 1 }, teacherEdited, createdAt: new Date("2026-07-15T12:00:00.000Z") };
      versions.push(record);
      return record;
    }),
    saveTeacherRevision: vi.fn(async ({ projectId, expectedVersion, operations, decidedAt }) => {
      const latest = versions.at(-1);
      if (!latest || latest.version !== expectedVersion) throw new CourseModelVersionConflict("STALE");
      const artifact = structuredClone(latest.artifact);
      for (const operation of operations) {
        if (operation.operation === "update_concept") {
          const concept = artifact.concepts.find(({ id }) => id === operation.id)!;
          if (operation.name) concept.name = operation.name;
          if (operation.description) concept.description = operation.description;
        }
      }
      artifact.generatedAt = decidedAt;
      const record = { id: `version-${versions.length + 1}`, projectId, version: versions.length + 1, artifact: { ...artifact, version: versions.length + 1 }, teacherEdited: true, createdAt: new Date(decidedAt) };
      versions.push(record);
      return record;
    }),
  };
  const sourceRepository = { list: vi.fn(async () => sources) } as unknown as SourceRepository;
  const analysisRepository = { listForProject: vi.fn(async () => [{ analysis: analysis(), analysisProfile: "course-model-v2-vision", createdAt: new Date("2026-07-15T12:00:00.000Z") }]) };
  const projectRepository = { findById: vi.fn(async () => ({ id: "project-alpha", teachingBrief: {} })) } as unknown as ProjectRepository;
  const synthesizer: CourseSynthesizer = { synthesize: vi.fn(async (input) => modelFor(input)), repair: vi.fn(async (input) => modelFor(input)) };
  return { sources, versions, courseModelRepository, sourceRepository, analysisRepository, projectRepository, synthesizer };
}

describe("compact course synthesis", () => {
  it("synthesizes every document analysis with explicit partial coverage and safe warnings", async () => {
    const deps = setup();
    const version = await synthesizeCourseModel("project-alpha", undefined, { ...deps, now: () => new Date("2026-07-15T12:30:00.000Z") });

    expect(version.teacherEdited).toBe(false);
    expect(version.artifact.coverage).toMatchObject({ documentCount: 3, analyzedCount: 1, failedCount: 1, analysisCompleteness: "partial", missingMaterialTypes: ["syllabus"] });
    expect(version.artifact.sourceManifest).toHaveLength(1);
    expect(version.artifact.warnings.map(({ code }) => code)).toEqual(expect.arrayContaining(["partial_analysis", "missing-syllabus"]));
    expect(deps.synthesizer.synthesize).toHaveBeenCalledWith(expect.objectContaining({ mode: "direct", analyses: [expect.objectContaining({ summary: "Structured probability findings only." })] }));
    expect(JSON.stringify((deps.synthesizer.synthesize as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("private-alpha");
  });

  it("repairs one invalid synthesis while enforcing the trusted envelope", async () => {
    const deps = setup();
    deps.synthesizer.synthesize = vi.fn().mockResolvedValue({ invalid: true });
    const version = await synthesizeCourseModel("project-alpha", undefined, { ...deps, now: () => new Date("2026-07-15T12:30:00.000Z") });
    expect(deps.synthesizer.repair).toHaveBeenCalledOnce();
    expect(version.artifact.projectId).toBe("project-alpha");
  });

  it("creates immutable teacher-edited versions and rejects stale patches", async () => {
    const deps = setup();
    await synthesizeCourseModel("project-alpha", undefined, { ...deps, now: () => new Date("2026-07-15T12:30:00.000Z") });
    const revised = await saveTeacherCourseModelRevision("project-alpha", { schemaVersion: "0.1", projectId: "project-alpha", baseVersion: 1, operations: [{ operation: "update_concept", id: "concept-alpha", description: "Teacher-approved wording." }] }, { ...deps, now: () => new Date("2026-07-15T12:31:00.000Z") });
    expect(revised).toMatchObject({ version: 2, teacherEdited: true });
    expect(revised.artifact.concepts[0]?.description).toBe("Teacher-approved wording.");
    expect(deps.versions[0].artifact.concepts[0].description).toBe("Events whose probabilities factor.");
    await expect(synthesizeCourseModel("project-alpha", undefined, deps)).rejects.toMatchObject({ code: "TEACHER_EDITS_REQUIRE_CONFIRMATION" });
    await expect(synthesizeCourseModel("project-alpha", { discardTeacherEdits: true }, deps)).resolves.toMatchObject({ version: 3, teacherEdited: false });
    await expect(saveTeacherCourseModelRevision("project-alpha", { schemaVersion: "0.1", projectId: "project-alpha", baseVersion: 1, operations: [{ operation: "update_concept", id: "concept-alpha", name: "Stale" }] }, deps)).rejects.toMatchObject({ code: "STALE_COURSE_MODEL" } satisfies Partial<CourseSynthesisError>);
  });

  it("selects only the current profile once per document and keeps large synthesis prompts bounded", () => {
    const current = analysis();
    const older = { ...analysis(), id: "analysis-older", summary: "older" };
    const selected = selectCurrentDocumentAnalyses([
      { analysis: older, analysisProfile: "course-model-v2-vision", createdAt: new Date("2026-07-15T11:00:00.000Z") },
      { analysis: current, analysisProfile: "course-model-v2-vision", createdAt: new Date("2026-07-15T12:00:00.000Z") },
      { analysis: { ...analysis(), id: "analysis-other" }, analysisProfile: "other-profile", createdAt: new Date("2026-07-15T13:00:00.000Z") },
    ]);
    expect(selected).toEqual([current]);

    const huge = Array.from({ length: 30 }, (_, index) => ({ ...analysis(`source-${index}`), id: `analysis-${index}`, documentHash: `${index.toString(16).padStart(2, "0")}${"a".repeat(62)}`, summary: "x".repeat(2_000), findings: { ...analysis().findings, topics: Array.from({ length: 80 }, (_, item) => ({ ...analysis().findings.topics[0]!, id: `topic-${index}-${item}`, description: "y".repeat(1_200), evidence: [{ documentId: `source-${index}`, documentAnalysisId: `analysis-${index}`, excerptId: `excerpt-${index}-${item}`, locatorLabel: "Large evidence" }] })) } }));
    const prompt = buildCourseSynthesizerInstructions({ projectId: "project-alpha", version: 1, generatedAt: "2026-07-15T12:00:00.000Z", teachingBrief: {}, sources: [], analyses: huge, sourceManifest: [], coverage: { documentCount: 30, analyzedCount: 30, failedCount: 0, analysisCompleteness: "complete", missingMaterialTypes: [] }, teacherDecisions: [], mode: "category_reduced" });
    expect(prompt.length).toBeLessThanOrEqual(COURSE_SYNTHESIS_SERIALIZED_PROMPT_BUDGET);

    const maxWarnings = Array.from({ length: 30 }, (_, index) => ({
      ...analysis(`warning-source-${index}`),
      id: `warning-analysis-${index}`,
      documentHash: `${index.toString(16).padStart(2, "0")}${"b".repeat(62)}`,
      summary: "z".repeat(2_000),
      coverage: { pageCount: 500, analyzedPages: 500, extractionWarnings: Array.from({ length: 64 }, () => "w".repeat(320)) },
    }));
    const warningPrompt = buildCourseSynthesizerInstructions({ projectId: "project-alpha", version: 1, generatedAt: "2026-07-15T12:00:00.000Z", teachingBrief: {}, sources: [], analyses: maxWarnings, sourceManifest: [], coverage: { documentCount: 30, analyzedCount: 30, failedCount: 0, analysisCompleteness: "complete", missingMaterialTypes: [] }, teacherDecisions: [], mode: "category_reduced" });
    expect(warningPrompt.length).toBeLessThanOrEqual(COURSE_SYNTHESIS_SERIALIZED_PROMPT_BUDGET);
  });
});
