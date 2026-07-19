"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { EvalScenario, PipelineJob } from "@/lib/schemas";
import { fetchActiveTutorVersion } from "@/lib/tutor/compiler-client";
import {
  fetchScenarioBuildState,
  generateEvaluationScenariosClient,
} from "@/lib/evaluation/scenario-client";
import { runEvaluation } from "@/lib/evaluation/evaluation-client";

function requestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `scenarios-${Date.now()}`;
}

function requestStorageKey(projectId: string, tutorVersionId: string) {
  return `tutorlab:scenario-request:${projectId}:${tutorVersionId}`;
}

function retainedRequestKey(projectId: string, tutorVersionId: string) {
  const key = requestStorageKey(projectId, tutorVersionId);
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = requestKey();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return requestKey();
  }
}

function clearRetainedRequestKey(projectId: string, tutorVersionId: string) {
  try {
    window.sessionStorage.removeItem(requestStorageKey(projectId, tutorVersionId));
  } catch {
    // Browser storage is optional.
  }
}

async function fetchJob(projectId: string, jobId: string, signal: AbortSignal): Promise<PipelineJob> {
  const response = await fetch(
    `/api/jobs/${jobId}?projectId=${encodeURIComponent(projectId)}`,
    { credentials: "same-origin", signal },
  );
  if (!response.ok) throw new Error("Build progress could not be refreshed.");
  const body = await response.json() as { job?: PipelineJob };
  if (!body.job) throw new Error("Build progress could not be refreshed.");
  return body.job;
}

export function BuildProgress({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [tutorVersionId, setTutorVersionId] = useState<string | null>(null);
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [scenarios, setScenarios] = useState<EvalScenario[]>([]);
  const [status, setStatus] = useState("Loading durable build status…");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const mounted = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const cancelRequest = useCallback(() => {
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const beginRequest = useCallback(() => {
    cancelRequest();
    const controller = new AbortController();
    requestController.current = controller;
    return controller;
  }, [cancelRequest]);

  const canUpdate = useCallback(
    (signal: AbortSignal) => mounted.current && !signal.aborted,
    [],
  );

  const poll = useCallback(async (jobId: string, activeTutorVersionId: string) => {
    const controller = beginRequest();
    try {
      const next = await fetchJob(projectId, jobId, controller.signal);
      if (!canUpdate(controller.signal)) return;
      setJob(next);
      if (next.status === "running" || next.status === "pending") {
        pollTimer.current = window.setTimeout(() => void poll(jobId, activeTutorVersionId), 1_000);
      } else if (next.status === "completed") {
        const state = await fetchScenarioBuildState(
          projectId,
          activeTutorVersionId,
          controller.signal,
        );
        if (!canUpdate(controller.signal)) return;
        setScenarios(state.scenarios);
        setScenarioCount(state.scenarios.length);
        clearRetainedRequestKey(projectId, activeTutorVersionId);
        setStatus("Six evaluation scenarios are ready.");
      } else {
        setStatus("Scenario generation stopped safely. Retry reuses the same request.");
      }
    } catch {
      if (!canUpdate(controller.signal)) return;
      setError("Build progress could not be refreshed. Try again when the connection returns.");
    }
  }, [beginRequest, canUpdate, projectId]);

  const load = useCallback(async () => {
    stopPolling();
    const controller = beginRequest();
    setError("");
    try {
      const tutor = await fetchActiveTutorVersion(projectId, controller.signal);
      if (!canUpdate(controller.signal)) return;
      if (!tutor) {
        setTutorVersionId(null);
        setScenarioCount(0);
        setScenarios([]);
        setStatus("Compile a tutor design before generating evaluation scenarios.");
        return;
      }
      setTutorVersionId(tutor.id);
      const state = await fetchScenarioBuildState(projectId, tutor.id, controller.signal);
      if (!canUpdate(controller.signal)) return;
      setScenarioCount(state.scenarios.length);
      setScenarios(state.scenarios);
      setJob(state.job);
      if (state.job?.status === "running" || state.job?.status === "pending") {
        setStatus("Scenario generation resumed from its durable job.");
        pollTimer.current = window.setTimeout(() => void poll(state.job!.id, tutor.id), 1_000);
      } else if (state.scenarios.length === 6 || state.job?.status === "completed") {
        clearRetainedRequestKey(projectId, tutor.id);
        setStatus("Six evaluation scenarios are ready.");
      } else if (state.job?.status === "failed") {
        setStatus("Scenario generation stopped safely. Retry reuses the same request.");
      } else {
        setStatus("Generate the six required evaluation scenarios.");
      }
    } catch {
      if (!canUpdate(controller.signal)) return;
      setError("Build status could not be loaded. Try again.");
      setStatus("");
    }
  }, [beginRequest, canUpdate, poll, projectId, stopPolling]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      stopPolling();
      cancelRequest();
    };
  }, [cancelRequest, load, stopPolling]);

  const generate = async () => {
    if (!tutorVersionId) return;
    stopPolling();
    const controller = beginRequest();
    setError("");
    setIsGenerating(true);
    setStatus("Generating six persisted evaluation scenarios…");
    try {
      const response = await generateEvaluationScenariosClient(
        projectId,
        tutorVersionId,
        retainedRequestKey(projectId, tutorVersionId),
        controller.signal,
      );
      if (!canUpdate(controller.signal)) return;
      setJob(response.job);
      setScenarioCount(response.scenarios.length);
      setScenarios(response.scenarios);
      setStatus(response.job.status === "completed" ? "Six evaluation scenarios are ready." : "Scenario generation is in progress.");
      if (response.job.status === "running" || response.job.status === "pending") {
        pollTimer.current = window.setTimeout(() => void poll(response.job.id, tutorVersionId), 1_000);
      } else if (response.job.status === "completed") {
        clearRetainedRequestKey(projectId, tutorVersionId);
      }
    } catch {
      if (!canUpdate(controller.signal)) return;
      setError("Evaluation scenarios could not be generated. You can safely try again.");
      setStatus("");
    } finally {
      if (canUpdate(controller.signal)) setIsGenerating(false);
    }
  };

  const evaluate = async () => {
    if (!tutorVersionId) return;
    const controller = beginRequest();
    setError("");
    setIsEvaluating(true);
    setStatus("Running the six-scenario evaluation…");
    try {
      await runEvaluation(projectId, tutorVersionId, controller.signal);
      if (!canUpdate(controller.signal)) return;
      window.location.assign(`/projects/${projectId}/report`);
    } catch (cause) {
      if (!canUpdate(controller.signal)) return;
      setError(cause instanceof Error ? cause.message : "The evaluation could not be completed. You can safely try again.");
      setStatus("");
    } finally {
      if (canUpdate(controller.signal)) setIsEvaluating(false);
    }
  };

  const progress = Math.round((job?.progress ?? (scenarioCount === 6 ? 1 : 0)) * 100);
  const failed = job?.status === "failed";
  if (!tutorVersionId && !error && status === "Loading durable build status…") {
    return <section aria-busy="true" className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card p-6 text-center"><span aria-label="Loading build" className="processing-ring size-10" /><h1 className="mt-5 text-2xl font-semibold">Preparing tutor build</h1><p className="mt-2 max-w-md text-muted-foreground">Loading the compiled tutor and build status.</p></section>;
  }
  return <section className="lg:grid lg:min-h-[calc(100vh-4.5rem)] lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]" aria-labelledby="build-progress-heading">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-10 sm:px-8">
        <div>
          <p className="mb-8 text-sm text-muted-foreground">Project: {projectName}</p>
          <h1 id="build-progress-heading" className="text-3xl font-semibold tracking-tight">Build evidence</h1>
          <p className="mt-2 text-muted-foreground">Track the persisted tutor build stages and prepare the six evaluation scenarios.</p>
        </div>
        <ol className="space-y-3" aria-label="Durable build stages">
          <li className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">Tutor design</p><p className="mt-1 text-sm text-muted-foreground">{tutorVersionId ? "A design was selected for the active tutor version." : "Select a design after the course model is ready."}</p></div>{tutorVersionId ? <CheckCircle2 aria-label="Complete" className="size-5 shrink-0 text-emerald-600" /> : null}</div></li>
          <li className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">Tutor specification</p><p className="mt-1 text-sm text-muted-foreground">{tutorVersionId ? "A compiled tutor version is active." : "Waiting for a selected design to compile."}</p></div>{tutorVersionId ? <CheckCircle2 aria-label="Complete" className="size-5 shrink-0 text-emerald-600" /> : null}</div></li>
          <li className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="font-medium">Evaluation scenarios</p><span className="text-sm text-muted-foreground">{scenarioCount}/6</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-muted" aria-label={`${progress}% scenario progress`}><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm text-muted-foreground">{failed ? job?.diagnostic?.message : `${progress}% durable job progress`}</p></li>
          <li className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Evaluation run</p><p className="mt-1 text-sm text-muted-foreground">{scenarioCount === 6 ? "Ready to assess the tutor against all six scenarios." : "Available after scenarios are ready."}</p></div>{scenarioCount === 6 ? <button type="button" onClick={() => void evaluate()} disabled={isEvaluating} aria-label={isEvaluating ? "Running evaluation" : undefined} className="flex min-w-28 justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">{isEvaluating ? <span aria-label="Running evaluation" className="processing-ring processing-ring-small" /> : "Run evaluation"}</button> : null}</div></li>
        </ol>
        {tutorVersionId && scenarioCount !== 6 ? <button type="button" onClick={() => void generate()} disabled={isGenerating || job?.status === "running"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">{isGenerating || job?.status === "running" ? "Generating scenarios…" : failed ? "Retry scenario generation" : "Generate six scenarios"}</button> : null}
        {error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="rounded-md border px-4 py-2 text-sm font-medium">Refresh build status</button></div> : null}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
      </div>
      <aside aria-busy={isGenerating} className="border-t bg-card p-5 lg:sticky lg:top-[4.5rem] lg:h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <h2 className="font-medium">Scenario generation</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Creates six course-grounded learner cases to check the tutor’s reasoning, hinting, scope boundaries, and answer-protection behavior before evaluation runs.</p>
        <div className="mt-5"><p className="text-sm font-medium">Generated previews</p>{isGenerating ? <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted p-3 text-sm font-medium"><span aria-label="Generating scenarios" className="processing-ring" /><span>Generating scenarios</span></div> : scenarios.length > 0 ? <ul className="mt-3 space-y-3" aria-label="Generated scenario previews">{scenarios.map((scenario) => <li key={scenario.id} className="rounded-lg bg-muted p-3"><p className="text-sm font-medium leading-5">{scenario.title}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{scenario.learnerMessages[0]}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No scenarios have been generated yet.</p>}</div>
      </aside>
  </section>;
}
