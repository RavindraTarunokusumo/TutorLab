import { z } from "zod";
import {
  ProjectStageSchema,
  TeachingBriefPatchSchema,
  type TeachingBriefPatch,
} from "@/lib/schemas/project";
import { TeachingBriefSchema } from "@/lib/schemas/teaching-brief";

const ClientProjectSnapshotSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  stage: ProjectStageSchema,
  teachingBrief: z.union([
    TeachingBriefSchema,
    TeachingBriefPatchSchema,
    z.strictObject({}),
  ]),
});

const SaveBriefResponseSchema = z.object({
  project: ClientProjectSnapshotSchema,
});

export type ClientProjectSnapshot = z.infer<typeof ClientProjectSnapshotSchema>;

export async function saveBriefPatch(
  projectId: string,
  patch: TeachingBriefPatch,
): Promise<ClientProjectSnapshot> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/brief`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TeachingBriefPatchSchema.parse(patch)),
  });

  if (!response.ok) {
    throw new Error("Unable to save teaching brief");
  }

  const parsed = SaveBriefResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Invalid teaching brief response");
  }
  return parsed.data.project;
}
