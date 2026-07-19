"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TutorDesignControlsSchema, type TutorDesign, type TutorDesignControls } from "@/lib/schemas";
import { fetchTutorDesigns, generateTutorDesignsClient } from "@/lib/tutor/design-client";
import { compileTutorClient } from "@/lib/tutor/compiler-client";

export type TutorDesignCompileRequest = { designId: string; overrides: TutorDesignControls };

type Props = { projectId: string; onCompile?: (request: TutorDesignCompileRequest) => Promise<void> };

const roles = {
  best_fit: "Recommended",
  strong_alternative: "Strong alternative",
  balanced_option: "Balanced option",
} as const;

const answerPolicyLabels = {
  never_reveal: "Never reveal final answers",
  reveal_after_sufficient_attempts: "Reveal after sufficient attempts",
  available_in_revision_mode: "Available in revision mode",
} as const;

function key(projectId: string) { return `tutorlab:tutor-design-selection:${projectId}`; }

function storedSelection(projectId: string, designs: TutorDesign[]) {
  try {
    const id = window.localStorage.getItem(key(projectId));
    return id && designs.some((design) => design.id === id) ? id : null;
  } catch { return null; }
}

function saveSelection(projectId: string, id: string) {
  try { window.localStorage.setItem(key(projectId), id); } catch { /* Browser storage is optional. */ }
}

function requestKey() { return globalThis.crypto?.randomUUID?.() ?? `design-${Date.now()}`; }

function wordLimit(value: number) {
  return Math.min(500, Math.max(50, Math.round(value / 50) * 50));
}

function Evidence({ evidence }: { evidence: TutorDesign["evidence"] }) {
  return <ul className="mt-1 space-y-1 text-sm text-muted-foreground" aria-label="Course evidence">
    {evidence.map((item) => <li key={`${item.locatorLabel}-${item.section ?? ""}`}>{item.locatorLabel}{item.section ? ` — ${item.section}` : ""}</li>)}
  </ul>;
}

export function TutorDesignComparison({ projectId, onCompile }: Props) {
  const [designs, setDesigns] = useState<TutorDesign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<TutorDesignControls | null>(null);
  const [status, setStatus] = useState("Loading tutor designs…");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const requestSequence = useRef(0);

  const receiveDesigns = useCallback((next: TutorDesign[], message: string) => {
    setDesigns(next);
    const restoredId = storedSelection(projectId, next);
    setSelectedId(restoredId);
    const restored = restoredId ? next.find((design) => design.id === restoredId) : null;
    setOverrides(restored ? { ...restored.controls, maxWords: wordLimit(restored.controls.maxWords) } : null);
    setStatus(message);
  }, [projectId]);

  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    setError(""); setStatus("Loading tutor designs…");
    try {
      const next = await fetchTutorDesigns(projectId);
      if (request !== requestSequence.current) return;
      receiveDesigns(next, next.length ? "Choose a tutor design to continue." : "Create three tutor designs to compare approaches.");
    } catch {
      if (request !== requestSequence.current) return;
      setDesigns([]); setSelectedId(null); setOverrides(null); setStatus("");
      setError("Tutor designs could not be loaded. Try again.");
    }
  }, [projectId, receiveDesigns]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => designs.find((design) => design.id === selectedId) ?? null, [designs, selectedId]);
  const validControls = overrides ? TutorDesignControlsSchema.safeParse(overrides).success : false;

  const choose = (design: TutorDesign) => {
    setSelectedId(design.id); setOverrides({ ...design.controls, maxWords: wordLimit(design.controls.maxWords) }); saveSelection(projectId, design.id);
    setError(""); setStatus(`${design.title} selected. Adjust its teaching controls before compiling.`);
  };

  const generate = async () => {
    const request = ++requestSequence.current;
    setGenerating(true); setError(""); setStatus("Creating three evidence-backed tutor designs…");
    try {
      const result = await generateTutorDesignsClient(projectId, { idempotencyKey: requestKey() });
      if (request !== requestSequence.current) return;
      receiveDesigns(result.designs, "Three tutor designs are ready to compare.");
    } catch {
      if (request !== requestSequence.current) return;
      setStatus(""); setError("Tutor designs could not be created. Try again.");
    } finally {
      if (request === requestSequence.current) setGenerating(false);
    }
  };

  const compile = async () => {
    if (!selected || !overrides || !validControls) return;
    setCompiling(true); setError(""); setStatus("Preparing the tutor specification…");
    try {
      if (onCompile) {
        await onCompile({ designId: selected.id, overrides });
      } else {
        await compileTutorClient(projectId, {
          idempotencyKey: requestKey(),
          designId: selected.id,
          controls: overrides,
        });
      }
      window.location.assign(`/projects/${projectId}/build`);
    }
    catch { setStatus(""); setError("The tutor could not be compiled. Review the controls and try again."); }
    finally { setCompiling(false); }
  };

  return <section className="space-y-6" aria-labelledby="tutor-design-heading">
    <div className="space-y-2">
      <h1 id="tutor-design-heading" className="text-3xl font-semibold tracking-tight">Tutor design comparison</h1>
      <p className="max-w-2xl text-muted-foreground">Compare three course-grounded teaching approaches, then choose one to tailor.</p>
    </div>

    {designs.length > 0 && <>
      <article className="rounded-xl border bg-muted/40 p-5">
        <h2 className="font-semibold">Shared learner prompt</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{designs[0]!.comparisonLearnerMessage}</p>
      </article>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Tutor design options">
      {designs.map((design) => {
        const isSelected = design.id === selectedId;
        return <article key={design.id} className={`flex h-full max-h-[calc(100vh-15rem)] flex-col rounded-xl border bg-card p-5 shadow-sm ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{design.title}</h2><span className="rounded-full bg-primary/10 px-2 py-1 text-center text-xs font-medium leading-tight text-primary">{roles[design.candidateRole]}</span></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{design.strategySummary}</p>
            <div className="mt-4 space-y-3 text-sm">
              <div><p className="font-medium">Course evidence</p><Evidence evidence={design.evidence} /></div>
              <p><span className="font-medium">Trade-off:</span> {design.tradeOff}</p>
              <p><span className="font-medium">Sample response:</span> {design.sampleResponse}</p>
            </div>
          </div>
          <button type="button" aria-pressed={isSelected} onClick={() => choose(design)} className="mt-5 w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{isSelected ? "Selected" : `Choose ${design.title}`}</button>
        </article>;
      })}
      </div>
    </>}

    {!designs.length && !error && <button type="button" onClick={() => void generate()} disabled={generating} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{generating ? "Creating designs…" : "Create tutor designs"}</button>}
    {error && <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Try again</button></div>}

    {selected && overrides && <form className="max-w-3xl space-y-5 rounded-xl border bg-card p-6 shadow-sm" onSubmit={(event) => { event.preventDefault(); void compile(); }}>
      <div><h2 className="text-xl font-semibold">Tailor {selected.title}</h2><p className="mt-1 text-sm text-muted-foreground">These controls become the teacher-approved starting policy.</p></div>
      <label className="flex items-center gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"><input type="checkbox" checked={overrides.diagnoseBeforeExplain} onChange={(event) => setOverrides({ ...overrides, diagnoseBeforeExplain: event.target.checked })} /><span><span className="font-medium">Diagnose before explaining</span><span className="block text-sm text-muted-foreground">Ask about the learner’s reasoning before giving an explanation.</span></span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Hint progression" value={overrides.hintEscalation} options={[["gradual", "Gradual"], ["balanced", "Balanced"], ["direct", "Direct"]]} onChange={(hintEscalation) => setOverrides({ ...overrides, hintEscalation })} />
        <Select label="Off-topic requests" value={overrides.offTopicHandling} options={[["redirect", "Redirect to the course"], ["brief_redirect", "Briefly redirect"], ["decline", "Decline"]]} onChange={(offTopicHandling) => setOverrides({ ...overrides, offTopicHandling })} />
        <label className="grid gap-2 text-sm font-medium"><span className="flex items-center justify-between">Maximum words per reply<output className="text-muted-foreground">{overrides.maxWords} words</output></span><input type="range" min="50" max="500" step="50" value={overrides.maxWords} onChange={(event) => setOverrides({ ...overrides, maxWords: Number(event.target.value) })} className="accent-primary" /><span className="flex justify-between text-xs font-normal text-muted-foreground"><span>50</span><span>500</span></span></label>
      </div>
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
        <div><p className="font-medium">Tone</p><p className="mt-1 capitalize text-muted-foreground">{overrides.tone}</p><p className="mt-1 text-xs text-muted-foreground">Inherited from the teaching brief.</p></div>
        <div><p className="font-medium">Answer sharing</p><p className="mt-1 text-muted-foreground">{answerPolicyLabels[overrides.answerPolicy]}</p><p className="mt-1 text-xs text-muted-foreground">Set by this design within the brief’s boundary.</p></div>
      </div>
      {!validControls && <p role="alert" className="text-sm text-destructive">Choose a reply length between 20 and 1,000 words before compiling.</p>}
      <div className="flex flex-wrap items-center gap-3 border-t pt-5"><button type="submit" disabled={!validControls || compiling} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{compiling ? "Compiling tutor…" : "Compile tutor"}</button></div>
    </form>}
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
  </section>;
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (value: T) => void }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value as T)} className="rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
}
