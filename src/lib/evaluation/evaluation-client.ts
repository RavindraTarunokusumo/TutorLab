import {
  EvalResultSchema,
  EvalRunSchema,
  EvalScenarioSchema,
  PipelineJobSchema,
  type EvalResult,
  type EvalRun,
  type EvalScenario,
  type PipelineJob,
} from "@/lib/schemas";

type EvaluationResponse = { job?: PipelineJob; run: EvalRun; results: EvalResult[]; scenarios?: EvalScenario[] };

function parseRun(input: unknown): EvalRun {
  if (!input || typeof input !== "object") return EvalRunSchema.parse(input);
  const run = { ...(input as Record<string, unknown>) };
  delete run.createdAt;
  delete run.updatedAt;
  return EvalRunSchema.parse(run);
}

function requestKey(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Evaluation data is unavailable.";
}

function parseResponse(input: unknown): EvaluationResponse {
  if (!input || typeof input !== "object") throw new Error("Evaluation data is unavailable.");
  const body = input as { job?: unknown; run?: unknown; results?: unknown; scenarios?: unknown };
  if (!Array.isArray(body.results)) throw new Error("Evaluation data is unavailable.");
  return {
    ...(body.job ? { job: PipelineJobSchema.parse(body.job) } : {}),
    run: parseRun(body.run),
    results: body.results.map((result) => EvalResultSchema.parse(result)),
    ...(Array.isArray(body.scenarios) ? { scenarios: body.scenarios.map((scenario) => EvalScenarioSchema.parse(scenario)) } : {}),
  };
}

export async function fetchLatestEvaluation(
  projectId: string,
  tutorVersionId: string,
  signal?: AbortSignal,
): Promise<EvaluationResponse | null> {
  const response = await fetch(
    `/api/tutors/${encodeURIComponent(tutorVersionId)}/evaluations?projectId=${encodeURIComponent(projectId)}`,
    { credentials: "same-origin", signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await errorMessage(response));
  return parseResponse(await response.json());
}

export async function runEvaluation(
  projectId: string,
  tutorVersionId: string,
  signal?: AbortSignal,
): Promise<EvaluationResponse> {
  const create = await fetch(`/api/tutors/${encodeURIComponent(tutorVersionId)}/evaluations`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, idempotencyKey: requestKey("evaluation") }),
    signal,
  });
  if (!create.ok) throw new Error(await errorMessage(create));
  const pending = parseResponse(await create.json());
  if (!pending.job) throw new Error("Evaluation creation did not return a job handle.");
  const execute = await fetch(
    `/api/tutors/${encodeURIComponent(tutorVersionId)}/evaluations/${encodeURIComponent(pending.run.id)}/execute`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, idempotencyKey: pending.job.idempotencyKey }),
      signal,
    },
  );
  if (!execute.ok) throw new Error(await errorMessage(execute));
  return parseResponse(await execute.json());
}
