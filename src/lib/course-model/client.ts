import {
  CourseModelPatchSchema,
  CourseModelSchema,
  type CourseModel,
  type CourseModelPatch,
  type CourseModelPatchOperation,
} from "@/lib/schemas";

export type CourseModelVersion = {
  id: string;
  projectId: string;
  version: number;
  artifact: CourseModel;
  teacherEdited: boolean;
  createdAt: string;
};

function responseMessage(response: Response, fallback: string) {
  return response
    .json()
    .then((body: unknown) =>
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : fallback,
    )
    .catch(() => fallback);
}

function parseVersion(input: unknown): CourseModelVersion {
  if (
    typeof input !== "object" ||
    input === null ||
    !("version" in input) ||
    typeof input.version !== "object" ||
    input.version === null
  ) {
    throw new Error("The course model response was not valid.");
  }

  const version = input.version as Record<string, unknown>;
  if (
    typeof version.id !== "string" ||
    typeof version.projectId !== "string" ||
    typeof version.version !== "number" ||
    typeof version.teacherEdited !== "boolean" ||
    typeof version.createdAt !== "string"
  ) {
    throw new Error("The course model response was not valid.");
  }

  return {
    id: version.id,
    projectId: version.projectId,
    version: version.version,
    artifact: CourseModelSchema.parse(version.artifact),
    teacherEdited: version.teacherEdited,
    createdAt: version.createdAt,
  };
}

export async function fetchCourseModel(
  projectId: string,
  signal?: AbortSignal,
): Promise<CourseModelVersion | null> {
  const response = await fetch(`/api/projects/${projectId}/course-model`, {
    credentials: "same-origin",
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await responseMessage(response, "Could not load the course model."));
  }
  return parseVersion(await response.json());
}

export async function saveCourseModelRevision(
  projectId: string,
  baseVersion: number,
  operations: CourseModelPatchOperation[],
  signal?: AbortSignal,
): Promise<CourseModelVersion> {
  const patch: CourseModelPatch = CourseModelPatchSchema.parse({
    schemaVersion: "0.1",
    projectId,
    baseVersion,
    operations,
  });
  const response = await fetch(`/api/projects/${projectId}/course-model`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
    signal,
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response, "Could not save this course-model revision."));
  }
  return parseVersion(await response.json());
}

export async function generateCourseModel(
  projectId: string,
  signal?: AbortSignal,
): Promise<CourseModelVersion> {
  const response = await fetch(`/api/projects/${projectId}/synthesize`, {
    method: "POST",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response, "Could not generate the course model."));
  }
  return parseVersion(await response.json());
}

export async function advanceToDesign(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/advance-design`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(
      await responseMessage(response, "Could not continue to tutor design."),
    );
  }
}
