import "server-only";
import { randomUUID } from "node:crypto";
import {
  type TutorArchitect,
} from "@/lib/ai/tutor-architect";
import {
  DESIGN_COMPARISON_LEARNER_MESSAGE,
  type TutorArchitectPromptInput,
} from "@/lib/ai/prompts/tutor-architect";
import {
  getCourseModelRepository,
  type CourseModelRepository,
} from "@/lib/analysis/course-synthesis";
import {
  getPipelineJobRepository,
  type PipelineJobRepository,
} from "@/lib/jobs/repository";
import { type ProjectRecord } from "@/lib/projects/repository";
import {
  TutorDesignSetSchema,
  type CourseModel,
  type EvidenceRef,
  type PipelineJob,
  type TeachingBrief,
  type TutorDesign,
  TeachingBriefSchema,
} from "@/lib/schemas";
import {
  listTutorCatalog,
  relevantTeacherConfirmedEvidence,
  validateCatalogDesign,
} from "@/lib/tutor/catalog";
import { recommendTutorStyles, recommendationFingerprint, type RecommendationPreferences } from "@/lib/tutor/recommendations";
import {
  getTutorRepository,
  type TutorDesignRecord,
  type TutorRepository,
} from "@/lib/tutor/repository";

export class TutorDesignGenerationError extends Error {
  constructor(
    readonly code:
      | "COURSE_MODEL_NOT_FOUND"
      | "INCOMPLETE_TEACHING_BRIEF"
      | "INVALID_DESIGN_OUTPUT"
      | "TRANSIENT_FAILURE",
  ) {
    super(code);
  }
}

export type GenerateTutorDesignsInput = {
  project: ProjectRecord;
  idempotencyKey: string;
  courseModelVersionId?: string;
  preferences?: RecommendationPreferences;
};

export type GenerateTutorDesignsResult = {
  job: PipelineJob;
  designs: TutorDesignRecord[];
};

type Dependencies = {
  architect?: TutorArchitect;
  courseModelRepository: CourseModelRepository;
  jobRepository: PipelineJobRepository;
  tutorRepository: TutorRepository;
  now: () => Date;
  createId: () => string;
};

function dependencies(overrides?: Partial<Dependencies>): Dependencies {
  return {
    architect: overrides?.architect,
    courseModelRepository:
      overrides?.courseModelRepository ?? getCourseModelRepository(),
    jobRepository: overrides?.jobRepository ?? getPipelineJobRepository(),
    tutorRepository: overrides?.tutorRepository ?? getTutorRepository(),
    now: overrides?.now ?? (() => new Date()),
    createId: overrides?.createId ?? randomUUID,
  };
}

function requireCompleteTeachingBrief(
  value: ProjectRecord["teachingBrief"],
  projectId: string,
): TeachingBrief {
  const result = TeachingBriefSchema.safeParse(value);
  const requiredSteps = new Set([
    "context",
    "purpose",
    "objectives",
    "style",
  ]);
  if (
    !result.success ||
    result.data.projectId !== projectId ||
    result.data.completedSteps.length !== requiredSteps.size ||
    new Set(result.data.completedSteps).size !== requiredSteps.size ||
    result.data.completedSteps.some((step) => !requiredSteps.has(step))
  ) {
    throw new TutorDesignGenerationError("INCOMPLETE_TEACHING_BRIEF");
  }
  return result.data;
}

function sameEvidence(left: EvidenceRef, right: EvidenceRef): boolean {
  return (
    left.documentId === right.documentId &&
    left.documentAnalysisId === right.documentAnalysisId &&
    left.excerptId === right.excerptId &&
    left.page === right.page &&
    left.section === right.section &&
    left.locatorLabel === right.locatorLabel
  );
}

function validateEvidenceReferences(
  design: TutorDesign,
  courseModel: CourseModel,
): boolean {
  const manifestByDocumentId = new Map(
    courseModel.sourceManifest.map((source) => [source.documentId, source]),
  );
  const courseEvidence = [
    ...courseModel.courseIdentity.evidence,
    ...courseModel.structure.units.flatMap((item) => item.evidence),
    ...courseModel.structure.prerequisiteRelations.flatMap(
      (item) => item.evidence,
    ),
    ...courseModel.learningObjectives.flatMap((item) => item.evidence),
    ...courseModel.concepts.flatMap((item) => item.evidence),
    ...courseModel.terminology.flatMap((item) => item.evidence),
    ...courseModel.methods.flatMap((item) => item.evidence),
    ...courseModel.exercises.flatMap((item) => item.evidence),
    ...courseModel.assessments.flatMap((item) => item.evidence),
    ...courseModel.rubricCriteria.flatMap((item) => item.evidence),
    ...courseModel.protectedSolutions.flatMap((item) => item.evidence),
    ...courseModel.misconceptions.flatMap((item) => item.evidence),
    ...courseModel.contentBoundaries.flatMap((item) => item.evidence),
    ...courseModel.pedagogicalEvidence.flatMap((item) => item.evidence),
    ...courseModel.conflicts.flatMap((item) => item.evidence),
    ...courseModel.warnings.flatMap((item) => item.evidence ?? []),
  ];
  return design.evidence.every((reference) => {
    const manifest = manifestByDocumentId.get(reference.documentId);
    return (
      manifest?.documentAnalysisId === reference.documentAnalysisId &&
      courseEvidence.some((courseReference) =>
        sameEvidence(courseReference, reference),
      )
    );
  });
}

function applyTeachingBriefSafeguards(
  output: unknown,
  brief: TeachingBrief,
): unknown {
  const parsed = TutorDesignSetSchema.safeParse(output);
  if (!parsed.success) return output;

  return {
    ...parsed.data,
    candidates: parsed.data.candidates.map((candidate) => ({
      ...candidate,
      controls: {
        ...candidate.controls,
        tone: brief.style.tone,
      },
    })),
  };
}

export function isTeachingBriefCompatible(
  design: TutorDesign,
  brief: TeachingBrief,
): boolean {
  return (
    design.controls.tone === brief.style.tone
  );
}

function validateDesignSet(
  output: unknown,
  input: TutorArchitectPromptInput,
): ReturnType<typeof TutorDesignSetSchema.parse> {
  let set: ReturnType<typeof TutorDesignSetSchema.parse>;
  try {
    set = TutorDesignSetSchema.parse(output);
  } catch {
    throw new TutorDesignGenerationError("INVALID_DESIGN_OUTPUT");
  }
  if (
    set.schemaVersion !== "0.1" ||
    set.id !== input.designSetId ||
    set.projectId !== input.projectId ||
    set.courseModelVersionId !== input.courseModelVersionId ||
    set.generatedAt !== input.generatedAt
  ) {
    throw new TutorDesignGenerationError("INVALID_DESIGN_OUTPUT");
  }

  const catalogIds = new Set<string>(
    listTutorCatalog().map(({ archetypeId }) => archetypeId),
  );
  if (
    set.candidates.some(
      (candidate) =>
        !catalogIds.has(candidate.archetypeId) ||
        candidate.comparisonLearnerMessage !== DESIGN_COMPARISON_LEARNER_MESSAGE ||
        !validateCatalogDesign(candidate).valid ||
        !validateEvidenceReferences(candidate, input.courseModel) ||
        !isTeachingBriefCompatible(candidate, input.teachingBrief),
    )
    || set.excludedCatalogOptions.some(
      (exclusion) => !catalogIds.has(exclusion.archetypeId),
    )
  ) {
    throw new TutorDesignGenerationError("INVALID_DESIGN_OUTPUT");
  }

  return set;
}

function selectPersistedGeneration(
  designs: TutorDesignRecord[],
  generationId?: string,
): TutorDesignRecord[] {
  const selectedGenerationId = generationId ?? designs[0]?.generationId;
  if (!selectedGenerationId) return [];
  return designs.filter((design) => design.generationId === selectedGenerationId);
}

export async function listLatestTutorDesigns(
  projectId: string,
  courseModelVersionId: string,
  repository: TutorRepository = getTutorRepository(),
): Promise<TutorDesignRecord[]> {
  return selectPersistedGeneration(
    await repository.listDesigns(projectId, courseModelVersionId),
  );
}

export async function generateTutorDesigns(
  input: GenerateTutorDesignsInput,
  overrides?: Partial<Dependencies>,
): Promise<GenerateTutorDesignsResult> {
  const deps = dependencies(overrides);
  const started = await deps.jobRepository.start({
    id: deps.createId(),
    projectId: input.project.id,
    stage: "design",
    idempotencyKey: input.idempotencyKey,
  });
  if (!started.shouldRun) {
    return {
      job: started.job,
      designs: started.job.resultId
        ? selectPersistedGeneration(
            await deps.tutorRepository.listDesigns(input.project.id),
            started.job.resultId,
          )
        : [],
    };
  }

  try {
    const brief = requireCompleteTeachingBrief(
      input.project.teachingBrief,
      input.project.id,
    );
    const courseModelVersion = await deps.courseModelRepository.findLatest(
      input.project.id,
    );
    if (
      !courseModelVersion ||
      (input.courseModelVersionId &&
        input.courseModelVersionId !== courseModelVersion.id)
    ) {
      throw new TutorDesignGenerationError("COURSE_MODEL_NOT_FOUND");
    }
    const architectInput: TutorArchitectPromptInput = {
      projectId: input.project.id,
      courseModelVersionId: courseModelVersion.id,
      courseModel: courseModelVersion.artifact,
      teachingBrief: brief,
      designSetId: deps.createId(),
      generatedAt: deps.now().toISOString(),
    };
    const preferences = input.preferences ?? { diagnoseBeforeExplain: true, hintEscalation: "gradual", offTopicHandling: "redirect", maxWords: 160 };
    const fingerprint = recommendationFingerprint(brief, courseModelVersion.artifact, preferences);
    const roles = ["best_fit", "strong_alternative", "balanced_option"] as const;
    const ranked = recommendTutorStyles(brief, courseModelVersion.artifact, preferences);
    const fallbackEvidence = courseModelVersion.artifact.courseIdentity.evidence[0]
      ?? courseModelVersion.artifact.pedagogicalEvidence.flatMap(({ evidence }) => evidence)[0];
    if (!fallbackEvidence || ranked.length !== 3) throw new TutorDesignGenerationError("INVALID_DESIGN_OUTPUT");
    const candidates = ranked.map(({ template }, index) => {
      const matchedEvidence = relevantTeacherConfirmedEvidence(courseModelVersion.artifact, template.archetypeId).flatMap(({ evidence }) => evidence).slice(0, 3);
      return {
        id: deps.createId(),
        archetypeId: template.archetypeId,
        templateVersion: template.templateVersion,
        recommendationVersion: "1" as const,
        recommendationFingerprint: fingerprint,
        candidateRole: roles[index]!,
        title: template.title,
        strategySummary: template.strategySummary,
        tradeOff: template.tradeOff,
        evidence: matchedEvidence.length ? matchedEvidence : [fallbackEvidence],
        comparisonLearnerMessage: DESIGN_COMPARISON_LEARNER_MESSAGE,
        sampleResponse: template.sampleResponse,
        controls: { ...template.defaultControls, ...preferences, tone: brief.style.tone },
        permittedAssistanceStates: template.permittedAssistanceStates.filter((state) => preferences.diagnoseBeforeExplain || state !== "diagnose"),
        permittedTeachingMoves: template.permittedTeachingMoves,
      };
    });
    const selectedIds = new Set(candidates.map(({ archetypeId }) => archetypeId));
    const set = validateDesignSet(applyTeachingBriefSafeguards({
      schemaVersion: "0.1",
      id: architectInput.designSetId,
      projectId: input.project.id,
      courseModelVersionId: courseModelVersion.id,
      candidates,
      excludedCatalogOptions: listTutorCatalog().filter(({ archetypeId }) => !selectedIds.has(archetypeId)).map(({ archetypeId }) => ({ archetypeId, reason: "A higher-scoring compatible style was recommended for the current course model and preferences." })),
      generatedAt: architectInput.generatedAt,
    }, brief), architectInput);
    const designs = await deps.tutorRepository.saveDesignSet(set);
    const job = await deps.jobRepository.complete(started.job.id, set.id);
    return { job, designs };
  } catch (error) {
    const failure =
      error instanceof TutorDesignGenerationError
        ? error
        : new TutorDesignGenerationError("TRANSIENT_FAILURE");
    await deps.jobRepository.fail(started.job.id, {
      code: failure.code.toLowerCase(),
      message: "Tutor designs could not be generated. Please try again.",
      retryable: failure.code === "TRANSIENT_FAILURE",
    });
    throw failure;
  }
}
