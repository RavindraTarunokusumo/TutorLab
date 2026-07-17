import {
  PipelineJobSchema,
  TutorDesignControlsSchema,
  TutorSpecSchema,
  type PipelineJob,
  type TutorDesignControls,
  type TutorSpec,
} from "@/lib/schemas";

export type TutorVersionSummary = {
  id: string;
  projectId: string;
  version: number;
  courseModelVersionId: string;
  selectedDesignId: string;
  selectedDesignIdentity: TutorSpec["selectedDesign"];
  spec: TutorSpec;
  status: "compiling" | "ready" | "failed";
  createdAt: string;
  compiledAt: string | null;
};

export type CompileTutorResponse = {
  job: PipelineJob;
  tutorVersion: TutorVersionSummary | null;
};

function responseMessage(response: Response): Promise<string> {
  return response
    .json()
    .then((body: unknown) =>
      typeof body === "object" && body !== null && "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Tutor compilation could not be completed.",
    )
    .catch(() => "Tutor compilation could not be completed.");
}

function parseVersion(input: unknown): TutorVersionSummary {
  if (typeof input !== "object" || input === null) throw new Error("The tutor version response was not valid.");
  const value = input as Record<string, unknown>;
  return {
    id: String(value.id),
    projectId: String(value.projectId),
    version: Number(value.version),
    courseModelVersionId: String(value.courseModelVersionId),
    selectedDesignId: String(value.selectedDesignId),
    selectedDesignIdentity: TutorSpecSchema.shape.selectedDesign.parse(value.selectedDesignIdentity),
    spec: TutorSpecSchema.parse(value.spec),
    status: zStatus(value.status),
    createdAt: String(value.createdAt),
    compiledAt: value.compiledAt === null ? null : String(value.compiledAt),
  };
}

function zStatus(value: unknown): TutorVersionSummary["status"] {
  if (value === "compiling" || value === "ready" || value === "failed") return value;
  throw new Error("The tutor version response was not valid.");
}

function parseCompileResponse(input: unknown): CompileTutorResponse {
  if (typeof input !== "object" || input === null) throw new Error("The tutor compilation response was not valid.");
  const value = input as Record<string, unknown>;
  return {
    job: PipelineJobSchema.parse(value.job),
    tutorVersion: value.tutorVersion === null ? null : parseVersion(value.tutorVersion),
  };
}

export async function compileTutorClient(
  projectId: string,
  input: {
    idempotencyKey: string;
    designId: string;
    controls: TutorDesignControls;
    courseModelVersionId?: string;
  },
  signal?: AbortSignal,
): Promise<CompileTutorResponse> {
  const response = await fetch(`/api/projects/${projectId}/compile`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, controls: TutorDesignControlsSchema.parse(input.controls) }),
    signal,
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return parseCompileResponse(await response.json());
}

export async function fetchActiveTutorVersion(
  projectId: string,
  signal?: AbortSignal,
): Promise<TutorVersionSummary | null> {
  const response = await fetch(`/api/projects/${projectId}/compile`, {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = await response.json() as { tutorVersion?: unknown };
  return body.tutorVersion === null || body.tutorVersion === undefined
    ? null
    : parseVersion(body.tutorVersion);
}
