import { z } from "zod";
import { SCHEMA_LIMITS } from "./constants";
import { StableIdSchema } from "./shared";

const EditableTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCHEMA_LIMITS.longText);

const UpdateConceptSchema = z
  .strictObject({
    operation: z.literal("update_concept"),
    id: StableIdSchema,
    name: z.string().trim().min(1).max(SCHEMA_LIMITS.label).optional(),
    description: EditableTextSchema.optional(),
  })
  .refine(({ name, description }) => name !== undefined || description !== undefined, {
    message: "A concept update must change at least one editable field",
  });

const UpdateObjectiveSchema = z.strictObject({
  operation: z.literal("update_learning_objective"),
  id: StableIdSchema,
  statement: EditableTextSchema,
});

const UpdateMisconceptionSchema = z.strictObject({
  operation: z.literal("update_misconception"),
  id: StableIdSchema,
  statement: EditableTextSchema.optional(),
  correction: EditableTextSchema.optional(),
}).refine(
  ({ statement, correction }) =>
    statement !== undefined || correction !== undefined,
  { message: "A misconception update must change at least one editable field" },
);

const UpdateObservationStatusSchema = z.strictObject({
  operation: z.literal("update_pedagogical_observation_status"),
  id: StableIdSchema,
  status: z.enum(["proposed", "teacher_confirmed", "teacher_rejected"]),
});

export const CourseModelPatchOperationSchema = z.union([
  UpdateConceptSchema,
  UpdateObjectiveSchema,
  UpdateMisconceptionSchema,
  UpdateObservationStatusSchema,
]);

const CurrentCourseModelPatchSchema = z.strictObject({
  schemaVersion: z.literal("0.1"),
  projectId: StableIdSchema,
  baseVersion: z.number().int().positive(),
  operations: z
    .array(CourseModelPatchOperationSchema)
    .min(1)
    .max(SCHEMA_LIMITS.patchOperations),
});

export const CourseModelPatchSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const patch = value as Record<string, unknown>;
  if (!Array.isArray(patch.operations)) return value;
  return { ...patch, operations: patch.operations.filter((operation) => !(operation && typeof operation === "object" && "operation" in operation && operation.operation === "update_disclosure_label")) };
}, CurrentCourseModelPatchSchema);

export type CourseModelPatchOperation = z.infer<
  typeof CourseModelPatchOperationSchema
>;
export type CourseModelPatch = z.infer<typeof CourseModelPatchSchema>;

export function parseCourseModelPatch(input: unknown): CourseModelPatch {
  return CourseModelPatchSchema.parse(input);
}
