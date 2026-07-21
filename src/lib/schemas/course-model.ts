import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import {
  OptionalEvidenceSchema,
  ProvenanceKindSchema,
  RequiredEvidenceSchema,
  SourceAuthoritySchema,
  SourceRoleSchema,
  StableIdSchema,
  TimestampSchema,
} from "./shared";

const LabelSchema = z.string().trim().min(1).max(SCHEMA_LIMITS.label);
const DescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCHEMA_LIMITS.longText);
const CompactStringListSchema = z
  .array(LabelSchema)
  .max(SCHEMA_LIMITS.stringListItems);
const StableIdListSchema = z
  .array(StableIdSchema)
  .max(SCHEMA_LIMITS.stringListItems);

const EvidenceBackedShape = {
  id: StableIdSchema,
  provenance: ProvenanceKindSchema,
  evidence: RequiredEvidenceSchema,
};

export const CourseIdentitySchema = z.strictObject({
  ...EvidenceBackedShape,
  title: LabelSchema,
  subject: LabelSchema,
  topic: LabelSchema,
  studentLevel: LabelSchema,
  language: LabelSchema,
  description: DescriptionSchema,
});

export const CourseUnitSchema = z.strictObject({
  ...EvidenceBackedShape,
  title: LabelSchema,
  description: DescriptionSchema,
  conceptIds: StableIdListSchema,
});

export const PrerequisiteRelationSchema = z.strictObject({
  ...EvidenceBackedShape,
  prerequisiteConceptId: StableIdSchema,
  dependentConceptId: StableIdSchema,
  rationale: DescriptionSchema,
});

export const LearningObjectiveSchema = z.strictObject({
  ...EvidenceBackedShape,
  statement: DescriptionSchema,
  conceptIds: StableIdListSchema,
});

export const ConceptSchema = z.strictObject({
  ...EvidenceBackedShape,
  name: LabelSchema,
  description: DescriptionSchema,
  unitIds: StableIdListSchema,
});

export const TermSchema = z.strictObject({
  ...EvidenceBackedShape,
  term: LabelSchema,
  definition: DescriptionSchema,
});

export const AcceptedMethodSchema = z.strictObject({
  ...EvidenceBackedShape,
  name: LabelSchema,
  description: DescriptionSchema,
  steps: z.array(DescriptionSchema).min(1).max(20),
});

export const ExerciseSummarySchema = z.strictObject({
  ...EvidenceBackedShape,
  title: LabelSchema,
  promptSummary: DescriptionSchema,
  assessed: z.boolean(),
  conceptIds: StableIdListSchema,
  protectedSolutionIds: StableIdListSchema,
});

export const AssessmentSummarySchema = z.strictObject({
  ...EvidenceBackedShape,
  title: LabelSchema,
  format: LabelSchema,
  exerciseIds: StableIdListSchema,
});

export const RubricCriterionSchema = z.strictObject({
  ...EvidenceBackedShape,
  label: LabelSchema,
  description: DescriptionSchema,
});

export const ProtectedSolutionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const solution = { ...(value as Record<string, unknown>) };
  delete solution.disclosureLabel;
  return solution;
}, z.strictObject({
  ...EvidenceBackedShape,
  exerciseId: StableIdSchema,
  summary: z.string().trim().min(1).max(SCHEMA_LIMITS.shortText),
}));

export const MisconceptionSchema = z.strictObject({
  ...EvidenceBackedShape,
  statement: DescriptionSchema,
  correction: DescriptionSchema,
});

export const ContentBoundarySchema = z.strictObject({
  ...EvidenceBackedShape,
  boundaryType: z.enum(["in_scope", "out_of_scope", "teacher_constraint"]),
  description: DescriptionSchema,
});

export const PedagogicalObservationSchema = z.strictObject({
  ...EvidenceBackedShape,
  observation: z.enum([
    "method_marks_emphasized",
    "reasoning_before_calculation",
    "consistent_solution_sequence",
    "conceptual_justification_required",
    "formal_notation_required",
    "common_misconception",
    "worked_examples_frequently_used",
    "assessment_answer_sensitive",
    "other",
  ]),
  description: DescriptionSchema,
  suggestedPolicyEffects: z
    .array(
      z.strictObject({
        policyPath: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
        proposedValue: z.json(),
        rationale: DescriptionSchema,
      }),
    )
    .max(12),
  confidence: z.number().min(0).max(1),
  status: z.enum(["proposed", "teacher_confirmed", "teacher_rejected"]),
});

export const CourseConflictSchema = z.strictObject({
  ...EvidenceBackedShape,
  description: DescriptionSchema,
  severity: z.enum(["info", "warning", "blocking"]),
});

export const CourseWarningSchema = z.strictObject({
  id: StableIdSchema,
  code: StableIdSchema,
  message: DescriptionSchema,
  severity: z.enum(["info", "warning"]),
  evidence: OptionalEvidenceSchema,
});

export const SourceReferenceSchema = z.strictObject({
  id: StableIdSchema,
  documentId: StableIdSchema,
  documentAnalysisId: StableIdSchema.optional(),
  name: LabelSchema,
  role: SourceRoleSchema,
  authority: SourceAuthoritySchema,
});

export const TeacherDecisionSchema = z.strictObject({
  id: StableIdSchema,
  fieldPath: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
  decision: DescriptionSchema,
  decidedAt: TimestampSchema,
});

const CourseItemListSchema = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(SCHEMA_LIMITS.courseItemsPerCategory);

function hasUniqueIds(items: ReadonlyArray<{ id: string }>): boolean {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

export const CourseModelSchema = z
  .strictObject({
    schemaVersion: z.literal("0.2"),
    projectId: StableIdSchema,
    version: z.number().int().positive(),
    coverage: z.strictObject({
      documentCount: z.number().int().nonnegative(),
      analyzedCount: z.number().int().nonnegative(),
      failedCount: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative().optional(),
      analysisCompleteness: z.enum(["complete", "partial"]),
      missingMaterialTypes: CompactStringListSchema,
    }),
    courseIdentity: CourseIdentitySchema,
    structure: z.strictObject({
      units: CourseItemListSchema(CourseUnitSchema),
      prerequisiteRelations: CourseItemListSchema(PrerequisiteRelationSchema),
    }),
    learningObjectives: CourseItemListSchema(LearningObjectiveSchema),
    concepts: CourseItemListSchema(ConceptSchema),
    terminology: CourseItemListSchema(TermSchema),
    methods: CourseItemListSchema(AcceptedMethodSchema),
    exercises: CourseItemListSchema(ExerciseSummarySchema),
    assessments: CourseItemListSchema(AssessmentSummarySchema),
    rubricCriteria: CourseItemListSchema(RubricCriterionSchema),
    protectedSolutions: CourseItemListSchema(ProtectedSolutionSchema),
    misconceptions: CourseItemListSchema(MisconceptionSchema),
    contentBoundaries: CourseItemListSchema(ContentBoundarySchema),
    pedagogicalEvidence: CourseItemListSchema(PedagogicalObservationSchema),
    conflicts: CourseItemListSchema(CourseConflictSchema),
    warnings: CourseItemListSchema(CourseWarningSchema),
    sourceManifest: CourseItemListSchema(SourceReferenceSchema),
    teacherDecisions: CourseItemListSchema(TeacherDecisionSchema),
    generatedAt: TimestampSchema,
  })
  .superRefine((model, context) => {
    const { coverage } = model;
    if (coverage.analyzedCount + coverage.failedCount > coverage.documentCount) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message: "Analyzed and failed counts cannot exceed document count",
      });
    }

    if (
      coverage.analysisCompleteness === "complete" &&
      (coverage.analyzedCount !== coverage.documentCount ||
        coverage.failedCount !== 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverage", "analysisCompleteness"],
        message: "Complete coverage requires every document to be analyzed",
      });
    }

    const itemCollections = [
      model.structure.units,
      model.structure.prerequisiteRelations,
      model.learningObjectives,
      model.concepts,
      model.terminology,
      model.methods,
      model.exercises,
      model.assessments,
      model.rubricCriteria,
      model.protectedSolutions,
      model.misconceptions,
      model.contentBoundaries,
      model.pedagogicalEvidence,
      model.conflicts,
      model.warnings,
      model.sourceManifest,
      model.teacherDecisions,
    ];

    if (itemCollections.some((items) => !hasUniqueIds(items))) {
      context.addIssue({
        code: "custom",
        message: "IDs must be unique within each course-model collection",
      });
    }

    const sourcesByDocumentId = new Map(
      model.sourceManifest.map((source) => [source.documentId, source]),
    );
    const evidenceCollections = [
      [model.courseIdentity],
      model.structure.units,
      model.structure.prerequisiteRelations,
      model.learningObjectives,
      model.concepts,
      model.terminology,
      model.methods,
      model.exercises,
      model.assessments,
      model.rubricCriteria,
      model.protectedSolutions,
      model.misconceptions,
      model.contentBoundaries,
      model.pedagogicalEvidence,
      model.conflicts,
      model.warnings,
    ];

    for (const items of evidenceCollections) {
      for (const item of items) {
        for (const evidence of item.evidence) {
          const source = sourcesByDocumentId.get(evidence.documentId);
          if (!source) {
            context.addIssue({
              code: "custom",
              message: `Evidence document ${evidence.documentId} is absent from the source manifest`,
            });
            continue;
          }

          if (
            evidence.documentAnalysisId !== source.documentAnalysisId
          ) {
            context.addIssue({
              code: "custom",
              message: `Evidence analysis ID is inconsistent for document ${evidence.documentId}`,
            });
          }
        }
      }
    }

    if (
      JSON.stringify(model).length > SCHEMA_LIMITS.courseModelSerializedCharacters
    ) {
      context.addIssue({
        code: "custom",
        message: "Course model exceeds the compact artifact size limit",
      });
    }
  });

export type CourseIdentity = z.infer<typeof CourseIdentitySchema>;
export type CourseUnit = z.infer<typeof CourseUnitSchema>;
export type PrerequisiteRelation = z.infer<typeof PrerequisiteRelationSchema>;
export type LearningObjective = z.infer<typeof LearningObjectiveSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Term = z.infer<typeof TermSchema>;
export type AcceptedMethod = z.infer<typeof AcceptedMethodSchema>;
export type ExerciseSummary = z.infer<typeof ExerciseSummarySchema>;
export type AssessmentSummary = z.infer<typeof AssessmentSummarySchema>;
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;
export type ProtectedSolution = z.infer<typeof ProtectedSolutionSchema>;
export type Misconception = z.infer<typeof MisconceptionSchema>;
export type ContentBoundary = z.infer<typeof ContentBoundarySchema>;
export type PedagogicalObservation = z.infer<
  typeof PedagogicalObservationSchema
>;
export type CourseConflict = z.infer<typeof CourseConflictSchema>;
export type CourseWarning = z.infer<typeof CourseWarningSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type TeacherDecision = z.infer<typeof TeacherDecisionSchema>;
export type CourseModel = z.infer<typeof CourseModelSchema>;

export function parseCourseModel(input: unknown): CourseModel {
  return CourseModelSchema.parse(input);
}
