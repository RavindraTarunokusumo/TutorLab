import "server-only";
import type { ProjectRecord } from "@/lib/projects/repository";
import type { StoredTeachingBrief } from "./repository";
import type { ProjectStage } from "@/lib/schemas/project";
import { requireProjectAccess } from "./service";
import {
  hashProjectEditToken,
  verifyProjectEditToken,
} from "./auth";
import { getProjectRepository } from "./repository";

export type ProjectSnapshot = {
  id: string;
  name: string;
  stage: ProjectStage;
  teachingBrief: StoredTeachingBrief;
};

function toProjectSnapshot(project: ProjectRecord): ProjectSnapshot {
  return {
    id: project.id,
    name: project.name,
    stage: project.stage,
    teachingBrief: project.teachingBrief,
  };
}

export async function loadAuthorizedProjectSnapshot(
  projectId: string,
  editToken: string | undefined,
): Promise<ProjectSnapshot> {
  const headers = new Headers();
  if (editToken) {
    headers.set("cookie", `tutorlab_project_edit=${editToken}`);
  }

  const project = await requireProjectAccess(
    new Request(`http://localhost/projects/${projectId}`, { headers }),
    projectId,
  );
  return toProjectSnapshot(project);
}

export async function loadCurrentAuthorizedProjectSnapshot(
  editToken: string | undefined,
): Promise<ProjectSnapshot | null> {
  if (!editToken || !verifyProjectEditToken(editToken)) {
    return null;
  }

  const project = await getProjectRepository().findByEditTokenHash(
    hashProjectEditToken(editToken),
  );
  return project ? toProjectSnapshot(project) : null;
}
