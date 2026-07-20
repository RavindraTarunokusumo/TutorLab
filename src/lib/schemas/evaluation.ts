import { z } from "zod";
import {
  EVALUATION_MAX_TRANSCRIPT_TURNS,
  EVALUATION_SCENARIO_COUNT,
  SCHEMA_LIMITS,
} from "./constants";
import { ConversationMessageSchema, SafeUsageMetadataSchema } from "./conversation";
import { StableIdSchema, TimestampSchema } from "./shared";
import { HintEscalationSchema } from "./tutor-design";

const RequiredTextSchema = z.string().trim().min(1).max(SCHEMA_LIMITS.longText);

export const EvalScenarioTypeSchema = z.enum([
  "confident_misconception",
  "correct_result_invalid_reasoning",
  "stuck_after_two_hints",
  "persistent_final_answer_extraction",
  "off_topic_request",
  "unsupported_course_request",
]);

export const AllowedRepairPathSchema = z.enum([
  "/pedagogy/hint_escalation",
  "/pedagogy/diagnose_before_explain",
  "/boundaries/off_topic",
  "/boundaries/out_of_scope",
  "/hard_constraints",
  "/response_style/max_words",
]);

const RepairOperationShape = {
  op: z.literal("replace"),
  rationale: RequiredTextSchema,
};

export const RecommendedRepairSchema = z.discriminatedUnion("path", [
  z.strictObject({ ...RepairOperationShape, path: z.literal("/pedagogy/hint_escalation"), value: HintEscalationSchema }),
  z.strictObject({ ...RepairOperationShape, path: z.literal("/pedagogy/diagnose_before_explain"), value: z.boolean() }),
  z.strictObject({ ...RepairOperationShape, path: z.literal("/boundaries/off_topic"), value: z.enum(["redirect", "brief_redirect", "decline"]) }),
  z.strictObject({ ...RepairOperationShape, path: z.literal("/boundaries/out_of_scope"), value: z.enum(["state_limit_and_redirect", "redirect_to_teacher"]) }),
  z.strictObject({ ...RepairOperationShape, path: z.literal("/hard_constraints"), value: z.array(RequiredTextSchema).min(1).max(32) }),
  z.strictObject({ ...RepairOperationShape, path: z.literal("/response_style/max_words"), value: z.number().int().min(50).max(500) }),
]);

export const EvalScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    projectId: StableIdSchema,
    tutorVersionId: StableIdSchema,
    type: EvalScenarioTypeSchema,
    title: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
    learnerPersona: RequiredTextSchema,
    learnerIntent: RequiredTextSchema,
    learnerMessages: z.array(RequiredTextSchema).min(1).max(3),
    expectedBehavior: z.array(RequiredTextSchema).min(1).max(12),
    prohibitedBehavior: z.array(RequiredTextSchema).min(1).max(12),
    deterministicCriteria: z.array(RequiredTextSchema).min(1).max(12),
    maxLearnerTurns: z.number().int().positive().max(3),
    maxTutorTurns: z.number().int().positive().max(3),
    fixedAttack: z.boolean(),
    createdAt: TimestampSchema,
  })
  .superRefine((scenario, context) => {
    const extraction = scenario.type === "persistent_final_answer_extraction";
    if (scenario.fixedAttack !== extraction) {
      context.addIssue({
        code: "custom",
        path: ["fixedAttack"],
        message: "Only persistent final-answer extraction scenarios may use a fixed attack",
      });
    }
    if (extraction && scenario.learnerMessages.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["learnerMessages"],
        message: "The persistent answer-extraction scenario requires an adversarial sequence",
      });
    }
    if (scenario.maxLearnerTurns === 1 && scenario.maxTutorTurns !== 1) {
      context.addIssue({
        code: "custom",
        path: ["maxTutorTurns"],
        message: "Single-turn scenarios allow exactly one tutor turn",
      });
    }
    if (scenario.learnerMessages.length > scenario.maxLearnerTurns) {
      context.addIssue({
        code: "custom",
        path: ["learnerMessages"],
        message: "Learner messages cannot exceed the scenario learner-turn limit",
      });
    }
  });

export const EvalScenarioSetSchema = z
  .array(EvalScenarioSchema)
  .length(EVALUATION_SCENARIO_COUNT)
  .superRefine((scenarios, context) => {
    const ids = scenarios.map(({ id }) => id);
    const types = scenarios.map(({ type }) => type);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Evaluation scenario IDs must be unique" });
    }
    if (new Set(types).size !== EVALUATION_SCENARIO_COUNT) {
      context.addIssue({ code: "custom", message: "Evaluation scenarios must contain each required type exactly once" });
    }
  });

export const DeterministicCheckSchema = z.strictObject({
  id: StableIdSchema,
  code: StableIdSchema,
  passed: z.boolean(),
  message: RequiredTextSchema,
  evidenceTurnIds: z.array(StableIdSchema).min(1).max(EVALUATION_MAX_TRANSCRIPT_TURNS),
});

export const JudgeFindingSchema = z.strictObject({
  code: StableIdSchema,
  message: RequiredTextSchema,
  evidenceTurnIds: z.array(StableIdSchema).min(1).max(EVALUATION_MAX_TRANSCRIPT_TURNS),
});

export const TeacherRecommendationSchema = z.strictObject({
  title: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText),
  configurationArea: z.enum([
    "response_length",
    "hint_progression",
    "source_materials",
    "off_topic_handling",
    "tone",
  ]),
  recommendation: RequiredTextSchema,
  rationale: RequiredTextSchema,
  evidenceScenarioIds: z.array(StableIdSchema).min(1).max(EVALUATION_SCENARIO_COUNT),
});

export const TeacherRecommendationSetSchema = z
  .array(TeacherRecommendationSchema)
  .min(1)
  .max(6);

export const JudgeResultSchema = z
  .strictObject({
    outcome: z.enum(["pass", "warning", "fail", "skipped"]),
    summary: RequiredTextSchema,
    warnings: z.array(JudgeFindingSchema).max(12),
    failures: z.array(JudgeFindingSchema).max(12),
    proposedRepair: RecommendedRepairSchema.optional(),
  })
  .superRefine((result, context) => {
    if (result.outcome === "pass" && (result.warnings.length > 0 || result.failures.length > 0)) {
      context.addIssue({ code: "custom", message: "Passing judge results cannot contain warnings or failures" });
    }
    if (result.outcome === "warning" && (result.warnings.length === 0 || result.failures.length > 0)) {
      context.addIssue({ code: "custom", message: "Warning judge results require warnings and cannot contain failures" });
    }
    if (result.outcome === "fail" && result.failures.length === 0) {
      context.addIssue({ code: "custom", message: "Failed judge results require at least one failure" });
    }
    if (result.outcome === "skipped" && (result.warnings.length > 0 || result.failures.length > 0 || result.proposedRepair)) {
      context.addIssue({ code: "custom", message: "Skipped judge results cannot contain findings or repairs" });
    }
  });

export const EvalResultStatusSchema = z.enum([
  "not_run",
  "running",
  "passed",
  "failed",
  "error",
]);

export const EvalResultSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    evalRunId: StableIdSchema,
    scenarioId: StableIdSchema,
    status: EvalResultStatusSchema,
    transcript: z.array(ConversationMessageSchema).max(EVALUATION_MAX_TRANSCRIPT_TURNS),
    deterministicChecks: z.array(DeterministicCheckSchema).max(16),
    judgeResult: JudgeResultSchema.optional(),
    usage: SafeUsageMetadataSchema.optional(),
    diagnostic: z.strictObject({
      code: StableIdSchema,
      message: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText),
      retryable: z.boolean(),
    }).optional(),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
  })
  .superRefine((result, context) => {
    const turnIds = new Set(result.transcript.map(({ id }) => id));
    const terminal = ["passed", "failed", "error"].includes(result.status);

    if (new Set(result.transcript.map(({ id }) => id)).size !== result.transcript.length) {
      context.addIssue({ code: "custom", path: ["transcript"], message: "Transcript turn IDs must be unique" });
    }
    for (const check of result.deterministicChecks) {
      if (check.evidenceTurnIds.some((id) => !turnIds.has(id))) {
        context.addIssue({ code: "custom", path: ["deterministicChecks"], message: "Deterministic check evidence must reference transcript turn IDs" });
      }
    }
    for (const finding of [...(result.judgeResult?.warnings ?? []), ...(result.judgeResult?.failures ?? [])]) {
      if (finding.evidenceTurnIds.some((id) => !turnIds.has(id))) {
        context.addIssue({ code: "custom", path: ["judgeResult"], message: "Judge findings must reference transcript turn IDs" });
      }
    }
    if (terminal && !result.completedAt) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Terminal evaluation results require a completion timestamp" });
    }
    if (!terminal && result.completedAt) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Nonterminal evaluation results cannot have a completion timestamp" });
    }
    if ((result.status === "passed" || result.status === "failed") && !result.judgeResult) {
      context.addIssue({ code: "custom", path: ["judgeResult"], message: "Completed evaluation results require a judge result" });
    }
    if ((result.status === "passed" || result.status === "failed") && result.deterministicChecks.length === 0) {
      context.addIssue({ code: "custom", path: ["deterministicChecks"], message: "Completed evaluation results require deterministic checks" });
    }
    const hasDeterministicFailure = result.deterministicChecks.some((check) => !check.passed);
    if (result.status === "passed") {
      if (hasDeterministicFailure) {
        context.addIssue({ code: "custom", path: ["deterministicChecks"], message: "Passed evaluation results cannot contain failed deterministic checks" });
      }
      if (result.judgeResult && !["pass", "warning"].includes(result.judgeResult.outcome)) {
        context.addIssue({ code: "custom", path: ["judgeResult"], message: "Passed evaluation results require a passing or warning judge outcome" });
      }
    }
    if (result.status === "failed" && !hasDeterministicFailure && result.judgeResult?.outcome !== "fail") {
      context.addIssue({ code: "custom", message: "Failed evaluation results require a deterministic or judge failure" });
    }
    if (result.status === "error" && !result.diagnostic) {
      context.addIssue({ code: "custom", path: ["diagnostic"], message: "Errored evaluation results require a safe diagnostic" });
    }
    if (result.status !== "error" && result.diagnostic) {
      context.addIssue({ code: "custom", path: ["diagnostic"], message: "Only errored evaluation results may include a diagnostic" });
    }
  });

export const EvalRunSchema = z
  .strictObject({
    schemaVersion: z.literal("0.1"),
    id: StableIdSchema,
    projectId: StableIdSchema,
    tutorVersionId: StableIdSchema,
    scenarioIds: z.array(StableIdSchema).min(1).max(EVALUATION_SCENARIO_COUNT),
    status: z.enum(["pending", "running", "completed", "failed"]),
    readiness: z.enum(["ready", "ready_with_warnings", "needs_revision", "pending"]),
    passCount: z.number().int().nonnegative().max(EVALUATION_SCENARIO_COUNT),
    warningCount: z.number().int().nonnegative().max(EVALUATION_SCENARIO_COUNT),
    teacherRecommendations: z.array(TeacherRecommendationSchema).max(6).optional(),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
  })
  .superRefine((run, context) => {
    if (new Set(run.scenarioIds).size !== run.scenarioIds.length) {
      context.addIssue({ code: "custom", path: ["scenarioIds"], message: "Evaluation run scenario IDs must be unique" });
    }
    const terminal = run.status === "completed" || run.status === "failed";
    if (terminal !== Boolean(run.completedAt)) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Only terminal evaluation runs may have a completion timestamp" });
    }
    if (run.status !== "completed" && run.readiness !== "pending") {
      context.addIssue({ code: "custom", path: ["readiness"], message: "Only completed runs may report final readiness" });
    }
  });

export type EvalScenarioType = z.infer<typeof EvalScenarioTypeSchema>;
export type EvalScenario = z.infer<typeof EvalScenarioSchema>;
export type DeterministicCheck = z.infer<typeof DeterministicCheckSchema>;
export type JudgeFinding = z.infer<typeof JudgeFindingSchema>;
export type TeacherRecommendation = z.infer<typeof TeacherRecommendationSchema>;
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
export type EvalResult = z.infer<typeof EvalResultSchema>;
export type EvalRun = z.infer<typeof EvalRunSchema>;
export type AllowedRepairPath = z.infer<typeof AllowedRepairPathSchema>;

export function parseEvalScenario(input: unknown): EvalScenario {
  return EvalScenarioSchema.parse(input);
}

export function parseEvalScenarioSet(input: unknown): EvalScenario[] {
  return EvalScenarioSetSchema.parse(input);
}

export function parseEvalResult(input: unknown): EvalResult {
  return EvalResultSchema.parse(input);
}

export function parseEvalRun(input: unknown): EvalRun {
  return EvalRunSchema.parse(input);
}
