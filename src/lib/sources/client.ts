import {
  SourceDocumentSchema,
  PipelineJobSchema,
  type SourceAuthority,
  type SourceDocument,
  type SourcePermissions,
  type SourceRole,
  type PipelineJob,
} from "@/lib/schemas";

export type SourceUploadMetadata = {
  role: SourceRole;
  authority: SourceAuthority;
  permissions: SourcePermissions;
  containsProtectedSolutions: boolean;
};

async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "The source request could not be completed.";
  return new Error(message);
}

async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function fetchSources(
  projectId: string,
  signal?: AbortSignal,
): Promise<SourceDocument[]> {
  const body = await requestJson(`/api/projects/${projectId}/files`, { signal });
  const parsed = SourceDocumentSchema.array().safeParse(
    body && typeof body === "object" && "sources" in body ? body.sources : undefined,
  );
  if (!parsed.success) throw new Error("The source list response was invalid.");
  return parsed.data;
}

export async function uploadSourceFile(
  projectId: string,
  file: File,
  metadata: SourceUploadMetadata,
): Promise<SourceDocument> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("metadata", JSON.stringify(metadata));
  const body = await requestJson(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: formData,
  });
  const parsed = SourceDocumentSchema.safeParse(
    body && typeof body === "object" && "source" in body ? body.source : undefined,
  );
  if (!parsed.success) throw new Error("The uploaded source response was invalid.");
  return parsed.data;
}

export async function refreshSource(projectId: string, sourceId: string): Promise<SourceDocument> {
  const body = await requestJson(`/api/projects/${projectId}/files/${sourceId}`, {
    method: "POST",
  });
  const parsed = SourceDocumentSchema.safeParse(
    body && typeof body === "object" && "source" in body ? body.source : undefined,
  );
  if (!parsed.success) throw new Error("The source refresh response was invalid.");
  return parsed.data;
}

function parsePipelineJob(body: unknown): PipelineJob {
  const parsed = PipelineJobSchema.safeParse(
    body && typeof body === "object" && "job" in body ? body.job : undefined,
  );
  if (!parsed.success) throw new Error("The analysis response was invalid.");
  return parsed.data;
}

export async function retrySourceAnalysis(
  projectId: string,
  sourceId: string,
): Promise<PipelineJob> {
  return parsePipelineJob(await requestJson(`/api/projects/${projectId}/files/${sourceId}/analyze`, {
    method: "POST",
  }));
}

export async function analyzeReadySources(projectId: string): Promise<PipelineJob> {
  return parsePipelineJob(await requestJson(`/api/projects/${projectId}/analyze`, { method: "POST" }));
}

export async function advanceToCourseModel(projectId: string): Promise<void> {
  await requestJson(`/api/projects/${projectId}/advance`, { method: "POST" });
}

export async function removeSource(projectId: string, sourceId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/files/${sourceId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw await responseError(response);
}
