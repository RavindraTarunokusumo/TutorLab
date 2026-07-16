import { randomUUID } from "node:crypto";
import {
  CreateProjectInputSchema,
  type CreateProjectInput,
  type TeachingBriefPatch,
} from "@/lib/schemas/project";
import {
  createProjectEditToken,
  getProjectEditToken,
  hashProjectEditToken,
  verifyProjectEditToken,
} from "./auth";
import {
  getProjectRepository,
  type ProjectRecord,
  type ProjectRepository,
} from "./repository";

export class ProjectAccessError extends Error {
  constructor(readonly status: 401 | 404) {
    super(status === 401 ? "Unauthorized" : "Not found");
  }
}

export type CreateProjectResult = {
  project: ProjectRecord;
  editToken: string;
};

export async function createProject(
  input: CreateProjectInput,
  repository: ProjectRepository = getProjectRepository(),
): Promise<CreateProjectResult> {
  const parsed = CreateProjectInputSchema.parse(input);
  const editToken = createProjectEditToken();
  const project = await repository.create({
    id: randomUUID(),
    name: parsed.name,
    stage: "brief",
    teachingBrief: parsed.initialBrief ?? {},
    editTokenHash: hashProjectEditToken(editToken),
  });

  return { project, editToken };
}

export async function requireProjectAccess(
  request: Request,
  projectId: string,
  repository: ProjectRepository = getProjectRepository(),
): Promise<ProjectRecord> {
  const editToken = getProjectEditToken(request);
  if (!editToken || !verifyProjectEditToken(editToken)) {
    throw new ProjectAccessError(401);
  }

  const project = await repository.findByIdAndEditTokenHash(
    projectId,
    hashProjectEditToken(editToken),
  );
  if (!project) {
    throw new ProjectAccessError(404);
  }

  return project;
}

export async function saveTeachingBrief(
  projectId: string,
  patch: TeachingBriefPatch,
  repository: ProjectRepository = getProjectRepository(),
): Promise<ProjectRecord> {
  return repository.updateTeachingBrief(projectId, patch);
}
