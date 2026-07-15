"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_WORKSPACE_BUDGET,
  type SourceAuthority,
  type SourceDocument,
  type SourcePermissions,
  type SourceRole,
  type PipelineJob,
} from "@/lib/schemas";
import {
  analyzeReadySources,
  fetchSources,
  refreshSource,
  removeSource,
  retrySourceAnalysis,
  uploadSourceFile,
} from "@/lib/sources/client";

const acceptedExtensions = [".pdf", ".docx", ".txt", ".md", ".json"];
const acceptedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/json",
]);

const roleOptions: ReadonlyArray<{ value: SourceRole; label: string }> = [
  { value: "syllabus", label: "Syllabus or learning objectives" },
  { value: "lecture", label: "Lecture notes, slides, or textbook excerpt" },
  { value: "exercise", label: "Exercise or worksheet" },
  { value: "assessment", label: "Sample exam or assessment" },
  { value: "rubric", label: "Rubric or marking scheme" },
  { value: "solution", label: "Answer key or worked solution" },
  { value: "teacher_note", label: "Teacher note" },
  { value: "other", label: "Other course material" },
];

const authorityOptions: ReadonlyArray<{ value: SourceAuthority; label: string }> = [
  { value: "teacher_instruction", label: "Teacher instruction" },
  { value: "course_authoritative", label: "Course authoritative" },
  { value: "supplementary", label: "Supplementary" },
  { value: "observational", label: "Observational" },
];

const defaultPermissions: SourcePermissions = {
  useForCourseModel: true,
  useForPedagogyDrafting: true,
  useForRuntimeRetrieval: false,
  useForEvaluation: true,
  revealExcerptsToStudents: false,
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function sourceIsActive(source: SourceDocument) {
  return Object.values(source.processing).some((value) => value === "in_progress");
}

function isAcceptedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return acceptedTypes.has(file.type) || acceptedExtensions.some((extension) => lowerName.endsWith(extension));
}

function budgetSummary(sources: SourceDocument[]) {
  return sources.reduce(
    (summary, source) => ({
      bytes: summary.bytes + source.sizeBytes,
      pages: summary.pages + (source.processing.pageCount ?? 0),
      tokens: summary.tokens + (source.processing.extractedTokenCount ?? 0),
      pendingTokenSources:
        summary.pendingTokenSources +
        (source.processing.extractedTokenCount === undefined ? 1 : 0),
    }),
    { bytes: 0, pages: 0, tokens: 0, pendingTokenSources: 0 },
  );
}

function replaceSource(sources: SourceDocument[], next: SourceDocument) {
  const index = sources.findIndex((source) => source.id === next.id);
  if (index === -1) return [...sources, next];
  return sources.map((source) => (source.id === next.id ? next : source));
}

function showAnalysisJobResult(
  job: PipelineJob,
  subject: string,
  refreshed: boolean,
  setNotice: (message: string) => void,
  setError: (message: string) => void,
) {
  if (job.status === "failed") {
    setNotice("");
    setError(
      job.diagnostic?.message ??
        "Document analysis could not be completed. Please retry.",
    );
    return;
  }
  if (!refreshed) return;
  if (job.status === "completed") {
    setNotice(`Analysis completed for ${subject}.`);
    return;
  }
  setNotice(`Analysis is running for ${subject}.`);
}

export function SourceWorkspace({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [role, setRole] = useState<SourceRole>("lecture");
  const [authority, setAuthority] = useState<SourceAuthority>("course_authoritative");
  const [permissions, setPermissions] = useState<SourcePermissions>(defaultPermissions);
  const [containsProtectedSolutions, setContainsProtectedSolutions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeProjectId = useRef(projectId);
  const lifecycleGeneration = useRef(0);
  const sourceRequestSequence = useRef(0);
  const sourceRequestController = useRef<AbortController | null>(null);

  if (activeProjectId.current !== projectId) {
    activeProjectId.current = projectId;
    lifecycleGeneration.current += 1;
  }

  const cancelSourceRequest = useCallback(() => {
    sourceRequestSequence.current += 1;
    sourceRequestController.current?.abort();
    sourceRequestController.current = null;
  }, []);

  const loadSources = useCallback(async (quiet = false) => {
    sourceRequestController.current?.abort();
    const controller = new AbortController();
    sourceRequestController.current = controller;
    const requestSequence = ++sourceRequestSequence.current;
    const requestedProjectId = projectId;
    if (!quiet) setLoading(true);
    try {
      const next = await fetchSources(projectId, controller.signal);
      if (
        requestSequence !== sourceRequestSequence.current ||
        activeProjectId.current !== requestedProjectId
      ) {
        return false;
      }
      setSources(next);
      setError("");
      return true;
    } catch (cause) {
      if (
        controller.signal.aborted ||
        requestSequence !== sourceRequestSequence.current ||
        activeProjectId.current !== requestedProjectId
      ) {
        return false;
      }
      setError(cause instanceof Error ? cause.message : "Could not load course sources.");
      return false;
    } finally {
      if (
        requestSequence === sourceRequestSequence.current &&
        activeProjectId.current === requestedProjectId
      ) {
        if (!quiet) setLoading(false);
        if (sourceRequestController.current === controller) {
          sourceRequestController.current = null;
        }
      }
    }
  }, [projectId]);

  useEffect(() => {
    setSources([]);
    setSelectedFiles([]);
    setBusy(false);
    setError("");
    setNotice("");
    void loadSources();
  }, [loadSources]);

  useEffect(() => () => {
    lifecycleGeneration.current += 1;
    cancelSourceRequest();
  }, [cancelSourceRequest]);

  useEffect(() => {
    if (!sources.some(sourceIsActive)) return;
    const interval = window.setInterval(() => void loadSources(true), 10_000);
    return () => window.clearInterval(interval);
  }, [loadSources, sources]);

  const summary = useMemo(() => budgetSummary(sources), [sources]);
  const queuedBytes = selectedFiles.reduce((total, file) => total + file.size, 0);
  const remainingFiles = DEFAULT_WORKSPACE_BUDGET.maxFiles - sources.length;

  function setPermission(permission: keyof SourcePermissions, value: boolean) {
    setPermissions((current) => ({ ...current, [permission]: value }));
  }

  function chooseFiles(files: File[]) {
    const localErrors: string[] = [];
    const accepted = files.filter((file) => {
      if (!isAcceptedFile(file)) {
        localErrors.push(`${file.name} has an unsupported file type.`);
        return false;
      }
      if (file.size > DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile) {
        localErrors.push(`${file.name} exceeds the 50 MB per-file limit.`);
        return false;
      }
      return true;
    });
    if (accepted.length > remainingFiles) {
      localErrors.push(`Only ${Math.max(remainingFiles, 0)} source slots remain in this workspace.`);
    }
    if (summary.bytes + accepted.reduce((total, file) => total + file.size, 0) > DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes) {
      localErrors.push("The selected files would exceed the 200 MB workspace limit.");
    }
    setSelectedFiles(accepted.slice(0, Math.max(remainingFiles, 0)));
    setError(localErrors.join(" "));
    setNotice(accepted.length ? `${Math.min(accepted.length, Math.max(remainingFiles, 0))} file(s) ready to upload.` : "");
  }

  async function uploadSelectedFiles() {
    if (!selectedFiles.length) return;
    const mutationGeneration = lifecycleGeneration.current;
    const mutationIsCurrent = () =>
      lifecycleGeneration.current === mutationGeneration &&
      activeProjectId.current === projectId;
    cancelSourceRequest();
    setBusy(true);
    setError("");
    const failures: string[] = [];
    const uploadedFiles = new Set<File>();
    for (const file of selectedFiles) {
      try {
        const source = await uploadSourceFile(projectId, file, {
          role,
          authority,
          permissions,
          containsProtectedSolutions,
        });
        if (!mutationIsCurrent()) return;
        uploadedFiles.add(file);
        setSources((current) => replaceSource(current, source));
      } catch (cause) {
        if (!mutationIsCurrent()) return;
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "upload failed"}`);
      }
    }
    if (!mutationIsCurrent()) return;
    setSelectedFiles((current) => current.filter((file) => !uploadedFiles.has(file)));
    setBusy(false);
    if (failures.length) {
      setError(failures.join(" "));
      setNotice("");
    } else {
      setNotice("Sources uploaded. Processing status will update automatically.");
    }
  }

  async function refreshProcessing(source: SourceDocument) {
    const mutationGeneration = lifecycleGeneration.current;
    const mutationIsCurrent = () =>
      lifecycleGeneration.current === mutationGeneration &&
      activeProjectId.current === projectId;
    cancelSourceRequest();
    setBusy(true);
    setError("");
    try {
      const next = await refreshSource(projectId, source.id);
      if (!mutationIsCurrent()) return;
      setSources((current) => replaceSource(current, next));
      setNotice(`Refreshed processing for ${source.name}.`);
    } catch (cause) {
      if (!mutationIsCurrent()) return;
      setError(cause instanceof Error ? cause.message : "Could not refresh source processing.");
    } finally {
      if (mutationIsCurrent()) setBusy(false);
    }
  }

  async function retryAnalysis(source: SourceDocument) {
    const mutationGeneration = lifecycleGeneration.current;
    const mutationIsCurrent = () =>
      lifecycleGeneration.current === mutationGeneration &&
      activeProjectId.current === projectId;
    cancelSourceRequest();
    setBusy(true);
    setError("");
    try {
      const job = await retrySourceAnalysis(projectId, source.id);
      if (!mutationIsCurrent()) return;
      const refreshed = await loadSources(true);
      if (!mutationIsCurrent()) return;
      showAnalysisJobResult(job, source.name, refreshed, setNotice, setError);
    } catch (cause) {
      if (!mutationIsCurrent()) return;
      setError(cause instanceof Error ? cause.message : "Could not retry document analysis.");
    } finally {
      if (mutationIsCurrent()) setBusy(false);
    }
  }

  async function analyzeAll() {
    const mutationGeneration = lifecycleGeneration.current;
    const mutationIsCurrent = () =>
      lifecycleGeneration.current === mutationGeneration &&
      activeProjectId.current === projectId;
    cancelSourceRequest();
    setBusy(true);
    setError("");
    try {
      const job = await analyzeReadySources(projectId);
      if (!mutationIsCurrent()) return;
      const refreshed = await loadSources(true);
      if (!mutationIsCurrent()) return;
      showAnalysisJobResult(job, "ready course sources", refreshed, setNotice, setError);
    } catch (cause) {
      if (!mutationIsCurrent()) return;
      setError(cause instanceof Error ? cause.message : "Could not start source analysis.");
    } finally {
      if (mutationIsCurrent()) setBusy(false);
    }
  }

  async function remove(source: SourceDocument) {
    const mutationGeneration = lifecycleGeneration.current;
    const mutationIsCurrent = () =>
      lifecycleGeneration.current === mutationGeneration &&
      activeProjectId.current === projectId;
    cancelSourceRequest();
    setBusy(true);
    setError("");
    try {
      await removeSource(projectId, source.id);
      if (!mutationIsCurrent()) return;
      setSources((current) => current.filter((item) => item.id !== source.id));
      setNotice(`${source.name} was removed.`);
    } catch (cause) {
      if (!mutationIsCurrent()) return;
      setError(cause instanceof Error ? cause.message : "Could not remove source.");
    } finally {
      if (mutationIsCurrent()) setBusy(false);
    }
  }

  return (
    <section className="space-y-8" aria-labelledby="sources-heading">
      <div className="space-y-2">
        <p className="font-mono text-sm tracking-wide text-primary uppercase">Course sources</p>
        <h1 id="sources-heading" className="text-3xl font-semibold tracking-tight">Course sources</h1>
        <p className="max-w-3xl text-muted-foreground">Add the material that grounds this tutor. Upload course documents and set how each source may influence the course model. Protected answers are used only under the permissions you choose and are never shown here as excerpts.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace budget">
        <BudgetMeter label="Files" value={sources.length} limit={DEFAULT_WORKSPACE_BUDGET.maxFiles} detail={`${remainingFiles} remaining`} />
        <BudgetMeter label="Storage" value={summary.bytes} limit={DEFAULT_WORKSPACE_BUDGET.maxWorkspaceBytes} detail={`${formatBytes(summary.bytes)} of 200 MB`} />
        <BudgetMeter label="Pages" value={summary.pages} limit={DEFAULT_WORKSPACE_BUDGET.maxPages} detail={`${summary.pages} of 500 known pages`} />
        <BudgetMeter label="Extracted tokens" value={summary.tokens} limit={DEFAULT_WORKSPACE_BUDGET.maxExtractedTokens} detail={`${summary.tokens.toLocaleString()} known of 2,000,000${summary.pendingTokenSources ? ` · ${summary.pendingTokenSources} source${summary.pendingTokenSources === 1 ? "" : "s"} pending measurement` : ""}`} />
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="upload-heading">
        <div>
          <h2 id="upload-heading" className="text-xl font-semibold">Upload course material</h2>
          <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, TXT, Markdown, or JSON. Up to 50 MB each; page totals are measured after extraction.</p>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          Choose source files
          <input aria-label="Choose source files" type="file" multiple accept={acceptedExtensions.join(",")} disabled={busy} onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))} className="rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:font-medium" />
        </label>
        {selectedFiles.length > 0 && <p className="text-sm text-muted-foreground">Queued: {selectedFiles.map((file) => file.name).join(", ")} ({formatBytes(queuedBytes)})</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">Material role<select aria-label="Material role" value={role} onChange={(event) => setRole(event.target.value as SourceRole)} disabled={busy} className="rounded-md border bg-background px-3 py-2">{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium">Source authority<select aria-label="Source authority" value={authority} onChange={(event) => setAuthority(event.target.value as SourceAuthority)} disabled={busy} className="rounded-md border bg-background px-3 py-2">{authorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <fieldset className="grid gap-2 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Allowed uses</legend><PermissionCheckbox label="Use in the course model" checked={permissions.useForCourseModel} onChange={(value) => setPermission("useForCourseModel", value)} disabled={busy} /><PermissionCheckbox label="Use for pedagogy drafting" checked={permissions.useForPedagogyDrafting} onChange={(value) => setPermission("useForPedagogyDrafting", value)} disabled={busy} /><PermissionCheckbox label="Allow runtime retrieval" checked={permissions.useForRuntimeRetrieval} onChange={(value) => setPermission("useForRuntimeRetrieval", value)} disabled={busy} /><PermissionCheckbox label="Use for evaluation" checked={permissions.useForEvaluation} onChange={(value) => setPermission("useForEvaluation", value)} disabled={busy} /><PermissionCheckbox label="Allow student excerpts" checked={permissions.revealExcerptsToStudents} onChange={(value) => setPermission("revealExcerptsToStudents", value)} disabled={busy} /></fieldset>
        <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={containsProtectedSolutions} disabled={busy} onChange={(event) => { const checked = event.target.checked; setContainsProtectedSolutions(checked); if (checked) setPermissions((current) => ({ ...current, useForRuntimeRetrieval: false, revealExcerptsToStudents: false })); }} /><span><span className="font-medium">Contains protected answers or worked solutions</span><span className="block text-amber-900">Student excerpts and runtime retrieval remain off unless explicitly permitted later.</span></span></label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || selectedFiles.length === 0} onClick={() => void uploadSelectedFiles()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Upload {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}</button><button type="button" disabled={busy || !sources.some((source) => source.processing.extractionStatus === "ready" && source.permissions.useForCourseModel)} onClick={() => void analyzeAll()} className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Analyze ready sources</button></div>
      </section>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{loading ? "Loading course sources…" : notice}</p>

      <section className="overflow-x-auto rounded-xl border bg-card shadow-sm" aria-labelledby="source-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 id="source-list-heading" className="font-semibold">Source processing</h2><p className="text-sm text-muted-foreground">Processing details are metadata only; source excerpts are intentionally unavailable in this workspace.</p></div><button type="button" onClick={() => void loadSources()} disabled={busy} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Refresh list</button></div>
        {loading ? <p className="px-5 py-6 text-sm text-muted-foreground">Loading course sources…</p> : sources.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No course sources yet.</p> : <table className="min-w-full text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">File</th><th className="px-5 py-3 font-medium">Use</th><th className="px-5 py-3 font-medium">Processing</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead><tbody>{sources.map((source) => <SourceRow key={source.id} source={source} busy={busy} onRefresh={() => void refreshProcessing(source)} onRetryAnalysis={() => void retryAnalysis(source)} onRemove={() => void remove(source)} />)}</tbody></table>}
      </section>
    </section>
  );
}

function BudgetMeter({ label, value, limit, detail }: { label: string; value: number; limit: number; detail: string }) {
  const progress = Math.min(100, (value / limit) * 100);
  return <article className="rounded-lg border bg-card p-4"><div className="flex justify-between gap-2"><h2 className="font-medium">{label}</h2><span className="text-sm text-muted-foreground">{detail}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} budget`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={value}><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div></article>;
}

function PermissionCheckbox({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function SourceRow({ source, busy, onRefresh, onRetryAnalysis, onRemove }: { source: SourceDocument; busy: boolean; onRefresh: () => void; onRetryAnalysis: () => void; onRemove: () => void }) {
  const retryAnalysis = source.processing.extractionStatus === "ready" && source.permissions.useForCourseModel && source.processing.analysisStatus !== "ready";
  return <tr className="border-b last:border-0"><td className="px-5 py-4 align-top"><p className="font-medium">{source.name}</p><p className="mt-1 text-xs text-muted-foreground">{source.role.replaceAll("_", " ")} · {formatBytes(source.sizeBytes)}</p>{source.containsProtectedSolutions && <p className="mt-2 inline-flex rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-950">Protected solutions</p>}</td><td className="px-5 py-4 align-top"><p>{source.authority.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{source.permissions.useForCourseModel ? "Course model enabled" : "Excluded from course model"}</p>{!source.permissions.revealExcerptsToStudents && <p className="mt-1 text-xs text-muted-foreground">Student excerpts are restricted</p>}</td><td className="px-5 py-4 align-top"><ul className="space-y-1 text-xs"><li>Upload: {formatStatus(source.processing.uploadStatus)}</li><li>Extraction: {formatStatus(source.processing.extractionStatus)}{source.processing.pageCount ? ` · ${source.processing.pageCount} pages` : ""}</li><li>Analysis: {formatStatus(source.processing.analysisStatus)}</li>{source.processing.error && <li className="text-destructive">{source.processing.error}</li>}</ul></td><td className="px-5 py-4 align-top"><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onRefresh} aria-label={`Refresh processing for ${source.name}`} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Refresh</button>{retryAnalysis && <button type="button" disabled={busy} onClick={onRetryAnalysis} aria-label={`Retry analysis for ${source.name}`} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Retry analysis</button>}<button type="button" disabled={busy} onClick={onRemove} aria-label={`Remove ${source.name}`} className="rounded-md px-3 py-1.5 text-xs font-medium text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Remove</button></div></td></tr>;
}
