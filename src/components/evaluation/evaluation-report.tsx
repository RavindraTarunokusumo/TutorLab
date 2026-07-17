"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvalResult, EvalRun } from "@/lib/schemas";
import { fetchLatestEvaluation, runEvaluation } from "@/lib/evaluation/evaluation-client";
import { fetchActiveTutorVersion } from "@/lib/tutor/compiler-client";

type ReportState = { run: EvalRun; results: EvalResult[] };

function statusLabel(status: EvalResult["status"]) {
  return status.replaceAll("_", " ");
}

function ResultCard({ result }: { result: EvalResult }) {
  const [open, setOpen] = useState(false);
  const findings = [
    ...result.deterministicChecks.filter((check) => !check.passed).map((check) => ({ kind: "Deterministic", ...check })),
    ...(result.judgeResult?.failures ?? []).map((finding) => ({ kind: "Judge", ...finding })),
    ...(result.judgeResult?.warnings ?? []).map((finding) => ({ kind: "Judge warning", ...finding })),
  ];
  return <article className="rounded-xl border bg-card p-5 shadow-sm" data-status={result.status}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{result.scenarioId}</h2><p className="mt-1 text-sm text-muted-foreground">{statusLabel(result.status)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${result.status === "passed" ? "bg-emerald-100 text-emerald-900" : "bg-destructive/10 text-destructive"}`}>{statusLabel(result.status)}</span></div>
    {result.diagnostic ? <p className="mt-3 text-sm text-destructive">{result.diagnostic.message}</p> : null}
    {findings.length ? <ul className="mt-4 space-y-2 text-sm" aria-label="Evaluation evidence">{findings.map((finding) => <li key={`${finding.kind}-${finding.code}`} className="rounded bg-muted/50 p-3"><span className="font-medium">{finding.kind}:</span> {finding.message}<span className="block mt-1 text-xs text-muted-foreground">Transcript turns: {finding.evidenceTurnIds.join(", ")}</span></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Deterministic checks and pedagogy judgment passed.</p>}
    <details className="mt-4 rounded border bg-muted/20 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Inspect evaluation evidence</summary>
      <ul className="mt-3 space-y-2" aria-label="All deterministic checks">
        {result.deterministicChecks.map((check) => <li key={check.id}><span className={check.passed ? "text-emerald-700" : "text-destructive"}>{check.passed ? "Passed" : "Failed"}</span>: {check.message}<span className="block text-xs text-muted-foreground">Transcript turns: {check.evidenceTurnIds.join(", ")}</span></li>)}
      </ul>
      {result.judgeResult ? <div className="mt-3 border-t pt-3"><p><span className="font-medium">Pedagogy judge:</span> {result.judgeResult.outcome} — {result.judgeResult.summary}</p>{[...result.judgeResult.warnings, ...result.judgeResult.failures].map((finding) => <p key={finding.code} className="mt-2">{finding.message}<span className="block text-xs text-muted-foreground">Transcript turns: {finding.evidenceTurnIds.join(", ")}</span></p>)}</div> : null}
    </details>
    <button type="button" className="mt-4 rounded border px-3 py-2 text-sm font-medium" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{open ? "Hide transcript" : "Inspect transcript"}</button>
    {open ? <ol className="mt-4 space-y-2 border-t pt-4" aria-label="Scenario transcript">{result.transcript.map((turn) => <li key={turn.id} className="rounded bg-muted/30 p-3 text-sm"><p className="text-xs font-medium uppercase text-muted-foreground">{turn.role} · {turn.id}</p><p className="mt-1 whitespace-pre-wrap leading-6">{turn.content}</p>{turn.metadata ? <p className="mt-2 text-xs text-muted-foreground">{turn.metadata.teachingMove} · {turn.metadata.currentState} → {turn.metadata.nextState} · {turn.metadata.citations.map((citation) => citation.title).join(", ") || "No citation"}</p> : null}</li>)}</ol> : null}
  </article>;
}

export function EvaluationReport({ projectId }: { projectId: string }) {
  const [tutorVersionId, setTutorVersionId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportState | null>(null);
  const [status, setStatus] = useState("Loading evaluation report…");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const tutor = await fetchActiveTutorVersion(projectId);
      if (!tutor) { setTutorVersionId(null); setReport(null); setStatus("Compile a tutor before running its evaluation."); return; }
      setTutorVersionId(tutor.id);
      const latest = await fetchLatestEvaluation(projectId, tutor.id);
      setReport(latest);
      setStatus(latest ? "Loaded the latest persisted evaluation run." : "Generate six scenarios, then run the evaluation.");
    } catch {
      setStatus(""); setError("The evaluation report could not be loaded. Try again.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const orderedResults = useMemo(() => {
    if (!report) return [];
    return [...report.results].sort((left, right) => Number(left.status === "passed") - Number(right.status === "passed"));
  }, [report]);

  const run = async () => {
    if (!tutorVersionId) return;
    setRunning(true); setError(""); setStatus("Running six independent evaluation scenarios…");
    try {
      const completed = await runEvaluation(projectId, tutorVersionId);
      setReport(completed); setStatus("Evaluation results are ready for inspection.");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "The evaluation could not be completed. You can safely try again.");
    } finally { setRunning(false); }
  };

  return <section className="max-w-4xl space-y-5" aria-labelledby="evaluation-report-heading">
    <div><h1 id="evaluation-report-heading" aria-label="Readiness report" className="text-3xl font-semibold tracking-tight">Tutor readiness report</h1><p className="mt-2 text-muted-foreground">Inspect persisted evaluation evidence before deciding whether the tutor is ready.</p></div>
    {report ? <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Readiness: {report.run.readiness.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-muted-foreground">{report.run.passCount} of {report.run.scenarioIds.length} scenarios passed · {report.run.warningCount} warnings</p></div><button type="button" onClick={() => void run()} disabled={running} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60">{running ? "Running evaluation…" : "Run again"}</button></div></article> : tutorVersionId ? <button type="button" onClick={() => void run()} disabled={running} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{running ? "Running evaluation…" : "Run six-scenario evaluation"}</button> : null}
    {report ? <div className="space-y-3" aria-label="Failure-first evaluation results">{orderedResults.map((result) => <ResultCard key={result.scenarioId} result={result} />)}</div> : null}
    <p className="text-sm text-muted-foreground">This milestone records evidence only. It does not apply repair recommendations.</p>
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="rounded border px-3 py-2 text-sm font-medium">Refresh report</button></div> : null}
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
  </section>;
}
