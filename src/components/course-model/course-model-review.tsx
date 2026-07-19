"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CourseModel,
  CourseModelPatchOperation,
  SourceDocument,
} from "@/lib/schemas";
import {
  fetchCourseModel,
  generateCourseModel,
  saveCourseModelRevision,
  advanceToDesign,
  type CourseModelVersion,
} from "@/lib/course-model/client";
import { fetchSources } from "@/lib/sources/client";

type ReviewSection =
  | "coverage"
  | "concepts"
  | "objectives"
  | "misconceptions"
  | "observations"
  | "solutions"
  | "warnings"
  | "conflicts";

type Selection = { section: ReviewSection; id?: string };
type Evidence = CourseModel["concepts"][number]["evidence"];

const sectionLabels: Record<ReviewSection, string> = {
  coverage: "Coverage",
  concepts: "Concepts",
  objectives: "Objectives",
  misconceptions: "Misconceptions",
  observations: "Pedagogy",
  solutions: "Disclosure labels",
  warnings: "Warnings",
  conflicts: "Conflicts",
};

function displayName(value: string) {
  return value.replaceAll("_", " ");
}

function initialSelection(model: CourseModel): Selection {
  if (model.concepts[0]) return { section: "concepts", id: model.concepts[0].id };
  if (model.learningObjectives[0]) return { section: "objectives", id: model.learningObjectives[0].id };
  if (model.misconceptions[0]) return { section: "misconceptions", id: model.misconceptions[0].id };
  return { section: "coverage" };
}

function sourceForEvidence(model: CourseModel, documentId: string) {
  return model.sourceManifest.find((source) => source.documentId === documentId);
}

function hasTeacherEdit(model: CourseModel, operation: CourseModelPatchOperation["operation"], id: string) {
  return model.teacherDecisions.some(
    (decision) => decision.fieldPath === `/${operation}/${id}`,
  );
}

function TeacherEditedMarker() {
  return <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-950">Teacher edited</span>;
}

function EvidenceButton({ evidence, onOpen }: { evidence: Evidence; onOpen: (evidence: Evidence[number]) => void }) {
  if (evidence.length === 0) {
    return <p className="text-sm text-muted-foreground">No source reference was recorded for this item.</p>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(evidence[0]!)}
      className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      View {evidence.length} source reference{evidence.length === 1 ? "" : "s"}
    </button>
  );
}

function ReviewNavigation({ model, selection, onSelect }: { model: CourseModel; selection: Selection; onSelect: (selection: Selection) => void }) {
  const groups: Array<{ section: ReviewSection; items: Array<{ id: string; label: string }> }> = [
    { section: "coverage", items: [{ id: "coverage", label: `${model.coverage.analyzedCount} of ${model.coverage.documentCount} analyzed` }] },
    { section: "concepts", items: model.concepts.map((item) => ({ id: item.id, label: item.name })) },
    { section: "objectives", items: model.learningObjectives.map((item) => ({ id: item.id, label: item.statement })) },
    { section: "misconceptions", items: model.misconceptions.map((item) => ({ id: item.id, label: item.statement })) },
    { section: "observations", items: model.pedagogicalEvidence.map((item) => ({ id: item.id, label: displayName(item.observation) })) },
    { section: "solutions", items: model.protectedSolutions.map((item) => ({ id: item.id, label: item.summary })) },
    { section: "warnings", items: model.warnings.map((item) => ({ id: item.id, label: item.message })) },
    { section: "conflicts", items: model.conflicts.map((item) => ({ id: item.id, label: item.description })) },
  ];

  return (
    <nav aria-label="Course model sections" className="space-y-5">
      {groups.map(({ section, items }) => (
        <section key={section} aria-labelledby={`${section}-heading`}>
          <h2 id={`${section}-heading`} className="text-sm font-semibold">{sectionLabels[section]}</h2>
          {items.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">None recorded.</p> : <ul className="mt-2 space-y-1">{items.map((item) => {
            const selected = selection.section === section && (section === "coverage" || selection.id === item.id);
            return <li key={item.id}><button type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(section === "coverage" ? { section } : { section, id: item.id })} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent aria-[current=true]:bg-primary/10 aria-[current=true]:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{item.label}</button></li>;
          })}</ul>}
        </section>
      ))}
    </nav>
  );
}

function CoverageDetail({ model }: { model: CourseModel }) {
  const partial = model.coverage.analysisCompleteness === "partial";
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Coverage</h1><p className="text-muted-foreground">{model.coverage.analyzedCount} of {model.coverage.documentCount} eligible documents were analyzed; {model.coverage.failedCount} failed.</p>{partial && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">This is a partial course model. Retry failed documents before relying on it for final course decisions.</p>}{model.coverage.missingMaterialTypes.length > 0 && <p className="rounded-md border p-3 text-sm">Missing material types: {model.coverage.missingMaterialTypes.join(", ")}.</p>}<p className="text-sm text-muted-foreground">Version {model.version} · generated {new Date(model.generatedAt).toLocaleString()}</p></section>;
}

function TextRevisionForm({ title, fields, onSave, busy, teacherEdited }: { title: string; fields: Array<{ name: string; label: string; value: string }>; onSave: (values: Record<string, string>) => Promise<void>; busy: boolean; teacherEdited: boolean }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.value])));
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSave(values); }}><h1 className="text-2xl font-semibold">{title}</h1>{fields.map((field) => <label key={field.name} className="grid gap-2 text-sm font-medium"><span>{field.label}{teacherEdited && <TeacherEditedMarker />}</span><textarea value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} rows={field.name === "name" ? 2 : 5} className="rounded-md border bg-background px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label>)}<button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Save teacher revision</button></form>;
}

function Detail({ model, selection, busy, onSave, onEvidence }: { model: CourseModel; selection: Selection; busy: boolean; onSave: (operation: CourseModelPatchOperation) => Promise<void>; onEvidence: (evidence: Evidence[number]) => void }) {
  if (selection.section === "coverage") return <CoverageDetail model={model} />;
  if (selection.section === "concepts") {
    const item = model.concepts.find(({ id }) => id === selection.id);
    if (!item) return <p>Select a concept to review it.</p>;
    return <section className="space-y-5"><TextRevisionForm key={`${item.id}:${item.name}:${item.description}`} title="Concept" busy={busy} teacherEdited={hasTeacherEdit(model, "update_concept", item.id)} fields={[{ name: "name", label: "Name", value: item.name }, { name: "description", label: "Description", value: item.description }]} onSave={(values) => onSave({ operation: "update_concept", id: item.id, name: values.name, description: values.description })} /><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  if (selection.section === "objectives") {
    const item = model.learningObjectives.find(({ id }) => id === selection.id);
    if (!item) return <p>Select an objective to review it.</p>;
    return <section className="space-y-5"><TextRevisionForm key={`${item.id}:${item.statement}`} title="Learning objective" busy={busy} teacherEdited={hasTeacherEdit(model, "update_learning_objective", item.id)} fields={[{ name: "statement", label: "Objective", value: item.statement }]} onSave={(values) => onSave({ operation: "update_learning_objective", id: item.id, statement: values.statement ?? "" })} /><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  if (selection.section === "misconceptions") {
    const item = model.misconceptions.find(({ id }) => id === selection.id);
    if (!item) return <p>Select a misconception to review it.</p>;
    return <section className="space-y-5"><TextRevisionForm key={`${item.id}:${item.statement}:${item.correction}`} title="Misconception" busy={busy} teacherEdited={hasTeacherEdit(model, "update_misconception", item.id)} fields={[{ name: "statement", label: "Misconception", value: item.statement }, { name: "correction", label: "Correction", value: item.correction }]} onSave={(values) => onSave({ operation: "update_misconception", id: item.id, statement: values.statement, correction: values.correction })} /><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  if (selection.section === "observations") {
    const item = model.pedagogicalEvidence.find(({ id }) => id === selection.id);
    if (!item) return <p>Select a pedagogical observation to review it.</p>;
    return <section className="space-y-4"><h1 className="text-2xl font-semibold">Pedagogical observation</h1><p>{item.description}</p><p className="text-sm text-muted-foreground">Confidence: {Math.round(item.confidence * 100)}%</p><label className="grid max-w-sm gap-2 text-sm font-medium"><span>Teacher status{hasTeacherEdit(model, "update_pedagogical_observation_status", item.id) && <TeacherEditedMarker />}</span><select value={item.status} disabled={busy} onChange={(event) => void onSave({ operation: "update_pedagogical_observation_status", id: item.id, status: event.target.value as "proposed" | "teacher_confirmed" | "teacher_rejected" })} className="rounded-md border bg-background px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><option value="proposed">Proposed</option><option value="teacher_confirmed">Teacher confirmed</option><option value="teacher_rejected">Teacher rejected</option></select></label><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  if (selection.section === "solutions") {
    const item = model.protectedSolutions.find(({ id }) => id === selection.id);
    if (!item) return <p>Select a disclosure label to review it.</p>;
    return <section className="space-y-4"><h1 className="text-2xl font-semibold">Protected solution</h1><p className="text-muted-foreground">Only the safe summary and disclosure policy are available here; protected source content is never displayed.</p><p>{item.summary}</p><label className="grid max-w-sm gap-2 text-sm font-medium"><span>Disclosure label{hasTeacherEdit(model, "update_disclosure_label", item.id) && <TeacherEditedMarker />}</span><select value={item.disclosureLabel} disabled={busy} onChange={(event) => void onSave({ operation: "update_disclosure_label", id: item.id, disclosureLabel: event.target.value as "never_reveal" | "reveal_after_sufficient_attempts" | "available_in_revision_mode" })} className="rounded-md border bg-background px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><option value="never_reveal">Never reveal</option><option value="reveal_after_sufficient_attempts">Reveal after sufficient attempts</option><option value="available_in_revision_mode">Available in revision mode</option></select></label><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  if (selection.section === "warnings") {
    const item = model.warnings.find(({ id }) => id === selection.id);
    if (!item) return <p>Select a warning to review it.</p>;
    return <section className="space-y-4"><h1 className="text-2xl font-semibold">Warning</h1><p>{item.message}</p><p className="text-sm text-muted-foreground">Severity: {item.severity}</p><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
  }
  const item = model.conflicts.find(({ id }) => id === selection.id);
  if (!item) return <p>Select a conflict to review it.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Conflict</h1><p>{item.description}</p><p className="text-sm text-muted-foreground">Severity: {item.severity}</p><EvidenceButton evidence={item.evidence} onOpen={onEvidence} /></section>;
}

function SourceDrawer({ model, evidence, onClose }: { model: CourseModel; evidence: Evidence[number]; onClose: () => void }) {
  const source = sourceForEvidence(model, evidence.documentId);
  return <aside role="dialog" aria-modal="true" aria-label="Source reference" className="fixed inset-y-0 right-0 z-10 w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Source reference</h2><p className="mt-1 text-sm text-muted-foreground">Metadata and locator only — no source passage is shown.</p></div><button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Close</button></div><dl className="mt-6 space-y-4 text-sm"><div><dt className="font-medium">File</dt><dd>{source?.name ?? "Unknown source"}</dd></div><div><dt className="font-medium">Material role</dt><dd>{source ? displayName(source.role) : "Unknown"}</dd></div><div><dt className="font-medium">Authority</dt><dd>{source ? displayName(source.authority) : "Unknown"}</dd></div><div><dt className="font-medium">Locator</dt><dd>{evidence.locatorLabel}</dd></div>{evidence.page !== undefined && <div><dt className="font-medium">Page</dt><dd>{evidence.page}</dd></div>}{evidence.section && <div><dt className="font-medium">Section</dt><dd>{evidence.section}</dd></div>}<div><dt className="font-medium">Evidence reference</dt><dd>{evidence.excerptId}</dd></div></dl></aside>;
}

export function CourseModelReview({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [version, setVersion] = useState<CourseModelVersion | null>(null);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [selection, setSelection] = useState<Selection>({ section: "coverage" });
  const [evidence, setEvidence] = useState<Evidence[number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeProject = useRef(projectId);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const requestedProject = projectId;
    setLoading(true);
    try {
      const next = await fetchCourseModel(projectId, controller.signal);
      if (controller.signal.aborted || activeProject.current !== requestedProject) return;
      const nextSources = next
        ? []
        : await fetchSources(projectId, controller.signal);
      if (controller.signal.aborted || activeProject.current !== requestedProject) return;
      setVersion(next);
      setSources(nextSources);
      setSelection(next ? initialSelection(next.artifact) : { section: "coverage" });
      setError("");
    } catch (cause) {
      if (!controller.signal.aborted && activeProject.current === requestedProject) setError(cause instanceof Error ? cause.message : "Could not load the course model.");
    } finally {
      if (!controller.signal.aborted && activeProject.current === requestedProject) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    activeProject.current = projectId;
    setVersion(null);
    setSources([]);
    setEvidence(null);
    setNotice("");
    setBusy(false);
    setGenerating(false);
    setError("");
    void load();
    return () => request.current?.abort();
  }, [load, projectId]);

  const save = useCallback(async (operation: CourseModelPatchOperation) => {
    if (!version) return;
    setBusy(true);
    setError("");
    try {
      const next = await saveCourseModelRevision(projectId, version.version, [operation]);
      if (activeProject.current !== projectId) return;
      setVersion(next);
      setNotice(`Saved as immutable version ${next.version}.`);
    } catch (cause) {
      if (activeProject.current === projectId) setError(cause instanceof Error ? cause.message : "Could not save this revision.");
    } finally {
      if (activeProject.current === projectId) setBusy(false);
    }
  }, [projectId, version]);

  const generate = useCallback(async () => {
    if (version) return;
    setGenerating(true);
    setError("");
    try {
      const next = await generateCourseModel(projectId);
      if (activeProject.current !== projectId) return;
      setVersion(next);
      setSources([]);
      setSelection(initialSelection(next.artifact));
      setNotice(`Generated course model version ${next.version}.`);
    } catch (cause) {
      if (activeProject.current === projectId) setError(cause instanceof Error ? cause.message : "Could not generate the course model.");
    } finally {
      if (activeProject.current === projectId) setGenerating(false);
    }
  }, [projectId, version]);

  const continueToDesign = useCallback(async () => {
    if (!version) return;
    setBusy(true);
    setError("");
    try {
      await advanceToDesign(projectId);
      if (activeProject.current === projectId) {
        router.push(`/projects/${projectId}/designs`);
      }
    } catch (cause) {
      if (activeProject.current === projectId) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not continue to tutor design.",
        );
      }
    } finally {
      if (activeProject.current === projectId) setBusy(false);
    }
  }, [projectId, router, version]);

  const model = version?.artifact;
  const incompleteWarning = useMemo(() => model?.coverage.analysisCompleteness === "partial", [model]);
  const sourcesReadyForGeneration =
    sources.length > 0 &&
    sources.every(
      (source) =>
        source.processing.extractionStatus === "ready" &&
        source.processing.analysisStatus === "ready",
    );
  if (loading) return <section aria-busy="true" className="rounded-xl border bg-card p-6"><h1 className="text-2xl font-semibold">Course model</h1><p className="mt-2 text-muted-foreground">Loading course model…</p></section>;
  if (generating) return <section aria-busy="true" className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card p-6 text-center"><span aria-label="Generating course model" className="processing-ring size-10" /><h1 className="mt-5 text-2xl font-semibold">Generating course model</h1><p className="mt-2 max-w-md text-muted-foreground">Combining the saved source analyses into one course model.</p></section>;
  if (error) return <section className="space-y-3 rounded-xl border bg-card p-6"><p role="alert">{error}</p><button type="button" onClick={() => void load()} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Try again</button></section>;
  if (!model) return <section className="max-w-3xl space-y-6 rounded-xl border bg-card p-6"><div><h1 className="text-2xl font-semibold">Create course model</h1><p className="mt-2 text-muted-foreground">Review the analyzed source set, then generate the first course model. This is the only action on this page that calls the model.</p></div><section className="rounded-lg border"><div className="border-b px-4 py-3"><h2 className="font-medium">Sources for this course model</h2></div>{sources.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">No course sources are available yet.</p> : <ul className="divide-y">{sources.map((source) => <li key={source.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><div><p className="font-medium">{source.name}</p><p className="mt-1 text-xs text-muted-foreground">{displayName(source.role)} · {source.processing.analysisStatus.replaceAll("_", " ")}</p></div><span className={source.processing.analysisStatus === "ready" ? "text-primary" : "text-muted-foreground"}>{source.processing.analysisStatus === "ready" ? "Ready" : "Waiting"}</span></li>)}</ul>}</section><div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!sourcesReadyForGeneration} onClick={() => void generate()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Generate course model</button>{!sourcesReadyForGeneration && <p className="text-sm text-muted-foreground">All sources must finish analysis before the course model can be generated.</p>}</div></section>;

  return <section className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"><div><p className="text-sm text-muted-foreground">Course model version {version.version}{version.teacherEdited ? " · teacher edited" : ""}</p><h1 className="text-2xl font-semibold">{model.courseIdentity.title}</h1></div><div className="flex flex-wrap gap-3"><button type="button" onClick={() => router.push(`/projects/${projectId}/sources`)} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Back to Sources</button><button type="button" disabled={busy} onClick={() => void continueToDesign()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Continue to Design</button></div></header>{incompleteWarning && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Reviewing a partial model: some source analyses are missing or failed.</p>}{notice && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{notice}</p>}<div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]"><aside className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border bg-card p-4"><ReviewNavigation model={model} selection={selection} onSelect={setSelection} /></aside><article className="min-w-0 rounded-xl border bg-card p-6"><Detail model={model} selection={selection} busy={busy} onSave={save} onEvidence={setEvidence} /></article></div>{evidence && <SourceDrawer model={model} evidence={evidence} onClose={() => setEvidence(null)} />}</section>;
}
