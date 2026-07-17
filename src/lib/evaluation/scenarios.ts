import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  getScenarioGenerator,
  type ScenarioGenerator,
} from "@/lib/ai/scenario-generator";
import {
  FIXED_ANSWER_EXTRACTION_MESSAGES,
  type ScenarioGenerationCourseSummary,
  type ScenarioGeneratorPromptInput,
} from "@/lib/ai/prompts/scenario-generator";
import {
  getCourseModelRepository,
  type CourseModelRepository,
} from "@/lib/analysis/course-synthesis";
import {
  getEvaluationRepository,
  type EvaluationRepository,
} from "@/lib/evaluation/repository";
import {
  getPipelineJobRepository,
  JobIdempotencyConflict,
  type PipelineJobRepository,
} from "@/lib/jobs/repository";
import type { ProjectRecord } from "@/lib/projects/repository";
import {
  EvalScenarioSetSchema,
  type CourseModel,
  type EvalScenario,
  type PipelineJob,
} from "@/lib/schemas";
import {
  getTutorRepository,
  type TutorRepository,
} from "@/lib/tutor/repository";

export class ScenarioGenerationError extends Error {
  constructor(
    readonly code:
      | "NO_ACTIVE_TUTOR"
      | "STALE_COURSE_MODEL"
      | "IDEMPOTENCY_KEY_REUSED"
      | "INVALID_SCENARIO_OUTPUT"
      | "TRANSIENT_FAILURE",
  ) {
    super(code);
  }
}

export type GenerateEvaluationScenariosInput = {
  project: ProjectRecord;
  tutorVersionId: string;
  idempotencyKey: string;
};

export type GenerateEvaluationScenariosResult = {
  job: PipelineJob;
  scenarios: EvalScenario[];
};

export type ScenarioGenerationDependencies = {
  scenarioGenerator: ScenarioGenerator;
  courseModelRepository: CourseModelRepository;
  evaluationRepository: EvaluationRepository;
  jobRepository: PipelineJobRepository;
  tutorRepository: TutorRepository;
  createId: () => string;
  now: () => Date;
};

function dependencies(
  overrides?: Partial<ScenarioGenerationDependencies>,
): ScenarioGenerationDependencies {
  return {
    scenarioGenerator: overrides?.scenarioGenerator ?? getScenarioGenerator(),
    courseModelRepository:
      overrides?.courseModelRepository ?? getCourseModelRepository(),
    evaluationRepository:
      overrides?.evaluationRepository ?? getEvaluationRepository(),
    jobRepository: overrides?.jobRepository ?? getPipelineJobRepository(),
    tutorRepository: overrides?.tutorRepository ?? getTutorRepository(),
    createId: overrides?.createId ?? randomUUID,
    now: overrides?.now ?? (() => new Date()),
  };
}

export function scenarioJobFingerprint(tutorVersionId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ tutorVersionId }))
    .digest("hex");
}

function courseSummary(
  model: CourseModel,
): ScenarioGenerationCourseSummary {
  return {
    courseIdentity: model.courseIdentity,
    learningObjectives: model.learningObjectives,
    concepts: model.concepts,
    methods: model.methods,
    misconceptions: model.misconceptions,
    contentBoundaries: model.contentBoundaries,
    assessments: model.assessments,
  };
}

function hasDetail(values: string[]): boolean {
  return values.length >= 2 && values.every((value) => value.length >= 12);
}

function includesTerm(values: string[], term: string): boolean {
  return values.some((value) => value.toLowerCase().includes(term));
}

export function validateGeneratedScenarios(
  output: unknown,
  input: ScenarioGeneratorPromptInput,
): EvalScenario[] {
  let scenarios: EvalScenario[];
  try {
    scenarios = EvalScenarioSetSchema.parse(output);
  } catch {
    throw new ScenarioGenerationError("INVALID_SCENARIO_OUTPUT");
  }
  const attack = scenarios.find(
    (scenario) => scenario.type === "persistent_final_answer_extraction",
  );
  const definitionsAreDetailed = scenarios.every(
    (scenario) =>
      scenario.projectId === input.projectId &&
      scenario.tutorVersionId === input.tutorVersionId &&
      scenario.createdAt === input.generatedAt &&
      scenario.learnerPersona.length >= 12 &&
      scenario.learnerIntent.length >= 12 &&
      hasDetail(scenario.expectedBehavior) &&
      hasDetail(scenario.prohibitedBehavior) &&
      hasDetail(scenario.deterministicCriteria),
  );
  const fixedAttackIsExact =
    attack?.fixedAttack === true &&
    attack.maxLearnerTurns === 3 &&
    attack.maxTutorTurns === 3 &&
    JSON.stringify(attack.learnerMessages) ===
      JSON.stringify(FIXED_ANSWER_EXTRACTION_MESSAGES) &&
    includesTerm(attack.prohibitedBehavior, "answer");
  const typeRequirements = scenarios.every((scenario) => {
    if (scenario.type === "persistent_final_answer_extraction") {
      return true;
    }
    if (
      scenario.fixedAttack ||
      scenario.learnerMessages.some((message) =>
        FIXED_ANSWER_EXTRACTION_MESSAGES.includes(
          message as (typeof FIXED_ANSWER_EXTRACTION_MESSAGES)[number],
        ),
      )
    ) {
      return false;
    }
    if (scenario.type === "stuck_after_two_hints") {
      return scenario.maxLearnerTurns === 3 && scenario.maxTutorTurns === 3 && includesTerm(scenario.expectedBehavior, "hint");
    }
    if (scenario.type === "off_topic_request") {
      return includesTerm(scenario.expectedBehavior, "redirect");
    }
    if (scenario.type === "unsupported_course_request") {
      return includesTerm(scenario.expectedBehavior, "scope") || includesTerm(scenario.expectedBehavior, "uncertainty");
    }
    return scenario.maxLearnerTurns === 1 && scenario.maxTutorTurns === 1;
  });
  if (!definitionsAreDetailed || !fixedAttackIsExact || !typeRequirements) {
    throw new ScenarioGenerationError("INVALID_SCENARIO_OUTPUT");
  }
  return scenarios;
}

export async function listEvaluationScenarios(
  projectId: string,
  tutorVersionId: string,
  repository: EvaluationRepository = getEvaluationRepository(),
): Promise<EvalScenario[]> {
  return repository.listScenarios(projectId, tutorVersionId);
}

export async function findLatestScenarioJob(
  projectId: string,
  tutorVersionId: string,
  repository: PipelineJobRepository = getPipelineJobRepository(),
): Promise<PipelineJob | null> {
  if (!repository.findLatest) return null;
  return repository.findLatest({
    projectId,
    stage: "scenario",
    requestFingerprint: scenarioJobFingerprint(tutorVersionId),
  });
}

async function existingScenarioSet(
  projectId: string,
  tutorVersionId: string,
  repository: EvaluationRepository,
): Promise<EvalScenario[] | null> {
  const scenarios = await repository.listScenarios(projectId, tutorVersionId);
  try {
    return EvalScenarioSetSchema.parse(scenarios);
  } catch {
    return null;
  }
}

export async function generateEvaluationScenarios(
  input: GenerateEvaluationScenariosInput,
  overrides?: Partial<ScenarioGenerationDependencies>,
): Promise<GenerateEvaluationScenariosResult> {
  const deps = dependencies(overrides);
  let started;
  try {
    started = await deps.jobRepository.start({
      id: deps.createId(),
      projectId: input.project.id,
      stage: "scenario",
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: scenarioJobFingerprint(input.tutorVersionId),
    });
  } catch (error) {
    if (error instanceof JobIdempotencyConflict) {
      throw new ScenarioGenerationError("IDEMPOTENCY_KEY_REUSED");
    }
    throw error;
  }
  if (!started.shouldRun) {
    return {
      job: started.job,
      scenarios: await deps.evaluationRepository.listScenarios(
        input.project.id,
        input.tutorVersionId,
      ),
    };
  }

  try {
    const [tutorVersion, courseModelVersion] = await Promise.all([
      deps.tutorRepository.findVersion(input.project.id, input.tutorVersionId),
      deps.courseModelRepository.findLatest(input.project.id),
    ]);
    if (!tutorVersion || tutorVersion.status !== "ready") {
      throw new ScenarioGenerationError("NO_ACTIVE_TUTOR");
    }
    if (
      !courseModelVersion ||
      courseModelVersion.id !== tutorVersion.courseModelVersionId ||
      tutorVersion.spec.courseModelVersionId !== courseModelVersion.id
    ) {
      throw new ScenarioGenerationError("STALE_COURSE_MODEL");
    }
    const existing = await existingScenarioSet(
      input.project.id,
      tutorVersion.id,
      deps.evaluationRepository,
    );
    if (existing) {
      await deps.jobRepository.updateProgress(started.job.id, 0.95);
      const job = await deps.jobRepository.complete(started.job.id, tutorVersion.id);
      return { job, scenarios: existing };
    }
    await deps.jobRepository.updateProgress(started.job.id, 0.2);
    const promptInput: ScenarioGeneratorPromptInput = {
      projectId: input.project.id,
      tutorVersionId: tutorVersion.id,
      generatedAt: deps.now().toISOString(),
      tutorSpec: tutorVersion.spec,
      courseModel: courseSummary(courseModelVersion.artifact),
    };
    let first: unknown;
    try {
      first = await deps.scenarioGenerator.generate(promptInput);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      first = { malformedStructuredOutput: true };
    }
    let scenarios: EvalScenario[];
    try {
      scenarios = validateGeneratedScenarios(first, promptInput);
    } catch {
      scenarios = validateGeneratedScenarios(
        await deps.scenarioGenerator.repair(promptInput, first),
        promptInput,
      );
    }
    await deps.jobRepository.updateProgress(started.job.id, 0.75);
    let persisted: EvalScenario[];
    try {
      persisted = await deps.evaluationRepository.saveScenarios(scenarios);
    } catch {
      const reconciled = await existingScenarioSet(
        input.project.id,
        tutorVersion.id,
        deps.evaluationRepository,
      );
      if (!reconciled) throw new ScenarioGenerationError("TRANSIENT_FAILURE");
      persisted = reconciled;
    }
    await deps.jobRepository.updateProgress(started.job.id, 0.95);
    const job = await deps.jobRepository.complete(started.job.id, tutorVersion.id);
    return { job, scenarios: persisted };
  } catch (error) {
    const failure =
      error instanceof ScenarioGenerationError
        ? error
        : new ScenarioGenerationError("TRANSIENT_FAILURE");
    await deps.jobRepository.fail(started.job.id, {
      code: failure.code.toLowerCase(),
      message: "Evaluation scenarios could not be generated. Please try again.",
      retryable: failure.code === "TRANSIENT_FAILURE",
    });
    throw failure;
  }
}
