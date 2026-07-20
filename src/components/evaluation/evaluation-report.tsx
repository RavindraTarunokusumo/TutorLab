"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { EvalResult, EvalRun, EvalScenario, TeacherRecommendation } from "@/lib/schemas";
import { fetchLatestEvaluation, runEvaluation } from "@/lib/evaluation/evaluation-client";
import { fetchActiveTutorVersion } from "@/lib/tutor/compiler-client";

type ReportState = { run: EvalRun; results: EvalResult[]; scenarios?: EvalScenario[] };

function statusLabel(status: EvalResult["status"]) {
  return status.replaceAll("_", " ");
}

const recommendationDestinations = {
  response_length: { label: "Configure in Design", href: "designs" },
  hint_progression: { label: "Configure in Design", href: "designs" },
  off_topic_handling: { label: "Configure in Design", href: "designs" },
  tone: { label: "Configure in Brief", href: "setup" },
  answer_sharing: { label: "Configure in Brief", href: "setup" },
  source_materials: { label: "Configure in Sources", href: "sources" },
} as const;

function transcriptMarkdown(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n$$${math}$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);
}

function TranscriptContent({ content }: { content: string }) {
  return <div className="break-words text-foreground [&_p]:my-2 [&_pre]:overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{transcriptMarkdown(content)}</ReactMarkdown></div>;
}

function ResultCard({ result, scenarioTitle }: { result: EvalResult; scenarioTitle: string }) {
  const [open, setOpen] = useState(false);
  const findings = [
    ...result.deterministicChecks.filter((check) => !check.passed).map((check) => ({ kind: "Deterministic", ...check })),
    ...(result.judgeResult?.failures ?? []).map((finding) => ({ kind: "Judge", ...finding })),
    ...(result.judgeResult?.warnings ?? []).map((finding) => ({ kind: "Judge warning", ...finding })),
  ];
  return <article className="rounded-xl border bg-card p-5 shadow-sm" data-status={result.status}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{scenarioTitle}</h2><p className="mt-1 text-sm text-muted-foreground">{statusLabel(result.status)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${result.status === "passed" ? "bg-emerald-100 text-emerald-900" : "bg-destructive/10 text-destructive"}`}>{statusLabel(result.status)}</span></div>
    {result.diagnostic ? <p className="mt-3 text-sm text-destructive">{result.diagnostic.message}</p> : null}
    {findings.length ? <ul className="mt-4 space-y-2 text-sm" aria-label="Evaluation evidence">{findings.map((finding) => <li key={`${finding.kind}-${finding.code}`} className="rounded bg-muted/50 p-3"><span className="font-medium">{finding.kind}:</span> {finding.message}</li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Deterministic checks and pedagogy judgment passed.</p>}
    <details className="mt-4 rounded border bg-muted/20 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Inspect evaluation evidence</summary>
      <ul className="mt-3 space-y-2" aria-label="All deterministic checks">
        {result.deterministicChecks.map((check) => <li key={check.id}><span className={check.passed ? "text-emerald-700" : "text-destructive"}>{check.passed ? "Passed" : "Failed"}</span>: {check.message}</li>)}
      </ul>
      {result.judgeResult ? <div className="mt-3 border-t pt-3"><p><span className="font-medium">Pedagogy judge:</span> {result.judgeResult.outcome} — {result.judgeResult.summary}</p>{[...result.judgeResult.warnings, ...result.judgeResult.failures].map((finding) => <p key={finding.code} className="mt-2">{finding.message}</p>)}</div> : null}
    </details>
    <button type="button" className="mt-4 rounded border px-3 py-2 text-sm font-medium" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{open ? "Hide transcript" : "Inspect transcript"}</button>
    {open ? <ol className="mt-4 space-y-2 border-t pt-4" aria-label="Scenario transcript">{result.transcript.map((turn) => <li key={turn.id} className="rounded bg-muted/30 p-3 text-sm"><p className="text-xs font-medium uppercase text-muted-foreground">{turn.role} · {turn.id}</p><div className="mt-1 leading-6"><TranscriptContent content={turn.content} /></div>{turn.metadata ? <p className="mt-2 text-xs text-muted-foreground">{turn.metadata.teachingMove} · {turn.metadata.currentState} → {turn.metadata.nextState} · {turn.metadata.citations.map((citation) => citation.title).join(", ") || "No citation"}</p> : null}</li>)}</ol> : null}
  </article>;
}

export function EvaluationReport({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [tutorVersionId, setTutorVersionId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportState | null>(null);
  const [status, setStatus] = useState("Loading evaluation report…");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [recommendations, setRecommendations] = useState<TeacherRecommendation[]>([]);
  const [advising, setAdvising] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const tutor = await fetchActiveTutorVersion(projectId);
      if (!tutor) { setTutorVersionId(null); setReport(null); setStatus("Compile a tutor before running its evaluation."); return; }
      setTutorVersionId(tutor.id);
      const latest = await fetchLatestEvaluation(projectId, tutor.id);
      setReport(latest);
      setRecommendations(latest?.run.teacherRecommendations ?? []);
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
  const scenarioTitles = useMemo(() => new Map(report?.scenarios?.map((scenario) => [scenario.id, scenario.title]) ?? []), [report]);
  const hasPedagogicalWarnings = report?.results.some(
    (result) => (result.judgeResult?.warnings.length ?? 0) > 0,
  ) ?? false;

  const run = async () => {
    if (!tutorVersionId) return;
    setRunning(true); setError(""); setStatus("Running six independent evaluation scenarios…");
    try {
      const completed = await runEvaluation(projectId, tutorVersionId);
      const refreshed = await fetchLatestEvaluation(projectId, tutorVersionId);
      setReport(refreshed ?? completed); setRecommendations((refreshed ?? completed).run.teacherRecommendations ?? []); setStatus("Evaluation results are ready for inspection.");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "The evaluation could not be completed. You can safely try again.");
    } finally { setRunning(false); }
  };

  const advise = async () => {
    if (!report || !tutorVersionId) return;
    setAdvising(true); setRecommendationError("");
    try {
      const response = await fetch(`/api/tutors/${encodeURIComponent(tutorVersionId)}/evaluations/${encodeURIComponent(report.run.id)}/recommendations`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }),
      });
      const body = await response.json() as { recommendations?: TeacherRecommendation[]; error?: string };
      if (!response.ok || !Array.isArray(body.recommendations)) throw new Error(body.error ?? "Teacher recommendations could not be generated.");
      setRecommendations(body.recommendations);
    } catch (cause) {
      setRecommendationError(cause instanceof Error ? cause.message : "Teacher recommendations could not be generated.");
    } finally { setAdvising(false); }
  };

  const continueToPreview = async () => {
    setAdvancing(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/advance-preview`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Preview could not be opened. Try again.");
      router.push(`/projects/${projectId}/preview`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview could not be opened. Try again.");
      setAdvancing(false);
    }
  };

  return <section className="max-w-4xl space-y-5" aria-labelledby="evaluation-report-heading">
    <div><h1 id="evaluation-report-heading" aria-label="Readiness report" className="text-3xl font-semibold tracking-tight">Tutor readiness report</h1><p className="mt-2 text-muted-foreground">Inspect persisted evaluation evidence before deciding whether the tutor is ready.</p></div>
    {report ? <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Readiness: {report.run.readiness.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-muted-foreground">{report.run.passCount} of {report.run.scenarioIds.length} scenarios passed · {report.run.warningCount} warnings</p></div><button type="button" onClick={() => void run()} disabled={running} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60">{running ? "Running evaluation…" : "Run again"}</button></div></article> : tutorVersionId ? <button type="button" onClick={() => void run()} disabled={running} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{running ? "Running evaluation…" : "Run six-scenario evaluation"}</button> : null}
    {hasPedagogicalWarnings ? <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Teacher recommendations</h2><p className="mt-1 text-sm text-muted-foreground">Turn pedagogical warnings into changes available in Brief, Sources, or Design.</p></div><button type="button" onClick={() => void advise()} disabled={advising} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{advising ? "Generating recommendations…" : "Generate recommendations"}</button></div>{recommendations.length ? <ul className="mt-4 space-y-3">{recommendations.map((recommendation) => { const destination = recommendationDestinations[recommendation.configurationArea]; return <li key={`${recommendation.configurationArea}-${recommendation.title}`} className="rounded-lg bg-muted/50 p-4"><p className="font-medium">{recommendation.title}</p><p className="mt-2 text-sm">{recommendation.recommendation}</p><p className="mt-2 text-sm text-muted-foreground">{recommendation.rationale}</p><Link href={`/projects/${projectId}/${destination.href}`} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">{destination.label}</Link></li>; })}</ul> : null}{recommendationError ? <p role="alert" className="mt-3 text-sm text-destructive">{recommendationError}</p> : null}</article> : null}
    {report ? <div className="space-y-3" aria-label="Failure-first evaluation results">{orderedResults.map((result) => <ResultCard key={result.scenarioId} result={result} scenarioTitle={scenarioTitles.get(result.scenarioId) ?? "Evaluation scenario"} />)}</div> : null}
    {report ? <button type="button" onClick={() => void continueToPreview()} disabled={advancing} className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">{advancing ? "Opening Preview…" : "Continue to Preview"}</button> : null}
    <p className="text-sm text-muted-foreground">This milestone records evidence only. It does not apply repair recommendations.</p>
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="rounded border px-3 py-2 text-sm font-medium">Refresh report</button></div> : null}
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
  </section>;
}
