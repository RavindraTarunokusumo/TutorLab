import {
  EvalScenarioSchema,
  PipelineJobSchema,
  type EvalScenario,
  type PipelineJob,
} from "@/lib/schemas";

export type ScenarioGenerationResponse = {
  job: PipelineJob;
  scenarios: EvalScenario[];
};

export type ScenarioBuildState = {
  scenarios: EvalScenario[];
  job: PipelineJob | null;
};

function responseMessage(response: Response): Promise<string> {
  return response
    .json()
    .then((body: unknown) =>
      typeof body === "object" && body !== null && "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Evaluation scenarios could not be generated.",
    )
    .catch(() => "Evaluation scenarios could not be generated.");
}

function parseResponse(input: unknown): ScenarioGenerationResponse {
  if (typeof input !== "object" || input === null) {
    throw new Error("The scenario response was not valid.");
  }
  const body = input as Record<string, unknown>;
  if (!Array.isArray(body.scenarios)) {
    throw new Error("The scenario response was not valid.");
  }
  return {
    job: PipelineJobSchema.parse(body.job),
    scenarios: body.scenarios.map((scenario) => EvalScenarioSchema.parse(scenario)),
  };
}

export async function generateEvaluationScenariosClient(
  projectId: string,
  tutorVersionId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ScenarioGenerationResponse> {
  const response = await fetch(`/api/tutors/${tutorVersionId}/scenarios`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, idempotencyKey }),
    signal,
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return parseResponse(await response.json());
}

export async function fetchEvaluationScenarios(
  projectId: string,
  tutorVersionId: string,
  signal?: AbortSignal,
): Promise<EvalScenario[]> {
  return (await fetchScenarioBuildState(projectId, tutorVersionId, signal)).scenarios;
}

export async function fetchScenarioBuildState(
  projectId: string,
  tutorVersionId: string,
  signal?: AbortSignal,
): Promise<ScenarioBuildState> {
  const response = await fetch(
    `/api/tutors/${tutorVersionId}/scenarios?projectId=${encodeURIComponent(projectId)}`,
    { credentials: "same-origin", signal },
  );
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = await response.json() as { scenarios?: unknown; job?: unknown };
  if (!Array.isArray(body.scenarios)) throw new Error("The scenario response was not valid.");
  return {
    scenarios: body.scenarios.map((scenario) => EvalScenarioSchema.parse(scenario)),
    job: body.job === null || body.job === undefined ? null : PipelineJobSchema.parse(body.job),
  };
}
