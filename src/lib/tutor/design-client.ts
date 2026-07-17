import {
  PipelineJobSchema,
  TutorDesignSchema,
  type PipelineJob,
  type TutorDesign,
} from "@/lib/schemas";

export type TutorDesignGenerationResponse = {
  job: PipelineJob;
  designs: TutorDesign[];
};

function responseMessage(response: Response): Promise<string> {
  return response
    .json()
    .then((body: unknown) =>
      typeof body === "object" && body !== null && "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Tutor designs could not be generated.",
    )
    .catch(() => "Tutor designs could not be generated.");
}

function parseResponse(input: unknown): TutorDesignGenerationResponse {
  if (typeof input !== "object" || input === null) {
    throw new Error("The tutor design response was not valid.");
  }
  const body = input as Record<string, unknown>;
  return {
    job: PipelineJobSchema.parse(body.job),
    designs: Array.isArray(body.designs)
      ? body.designs.map((design) => TutorDesignSchema.parse(design))
      : (() => {
          throw new Error("The tutor design response was not valid.");
        })(),
  };
}

export async function generateTutorDesignsClient(
  projectId: string,
  input: { idempotencyKey: string; courseModelVersionId?: string },
  signal?: AbortSignal,
): Promise<TutorDesignGenerationResponse> {
  const response = await fetch(`/api/projects/${projectId}/designs`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return parseResponse(await response.json());
}

export async function fetchTutorDesigns(
  projectId: string,
  signal?: AbortSignal,
): Promise<TutorDesign[]> {
  const response = await fetch(`/api/projects/${projectId}/designs`, {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = await response.json() as { designs?: unknown };
  if (!Array.isArray(body.designs)) {
    throw new Error("The tutor design response was not valid.");
  }
  return body.designs.map((design) => TutorDesignSchema.parse(design));
}
