import { z } from "zod";
import {
  TeachingBriefContextStepSchema,
  TeachingBriefObjectivesStepSchema,
  TeachingBriefPurposeStepSchema,
  TeachingBriefStyleStepSchema,
} from "./teaching-brief";
import { SCHEMA_LIMITS } from "./constants";

export const ProjectStageSchema = z.enum([
  "brief",
  "sources",
  "course_model",
  "design",
  "build",
  "report",
  "preview",
  "export",
]);

export const TeachingBriefPatchSchema = z
  .strictObject({
    context: TeachingBriefContextStepSchema,
    purpose: TeachingBriefPurposeStepSchema.shape.purpose,
    objectives: TeachingBriefObjectivesStepSchema.shape.objectives,
    style: TeachingBriefStyleStepSchema,
    completedSteps: z
      .array(z.enum(["context", "purpose", "objectives", "style"]))
      .max(4),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "A teaching brief patch must include at least one field",
  });

export const CreateProjectInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(SCHEMA_LIMITS.label),
  initialBrief: TeachingBriefPatchSchema.optional(),
});

export type ProjectStage = z.infer<typeof ProjectStageSchema>;
export type TeachingBriefPatch = z.infer<typeof TeachingBriefPatchSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
