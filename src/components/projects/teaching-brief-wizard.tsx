"use client";

import { useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft, type TeachingBriefDraft } from "@/lib/projects/brief-draft";
import { saveBriefPatch, type ClientProjectSnapshot } from "@/lib/projects/brief-client";
import type { TeachingBriefPatch } from "@/lib/schemas/project";
import {
  TeachingBriefAssistanceStepSchema,
  TeachingBriefContextStepSchema,
  TeachingBriefObjectivesStepSchema,
  TeachingBriefPurposeStepSchema,
  TeachingBriefStyleStepSchema,
} from "@/lib/schemas/teaching-brief";

type TeachingBriefWizardProps = {
  project: ClientProjectSnapshot;
};

const steps = ["context", "purpose", "objectives", "assistance", "style"] as const;
type Step = (typeof steps)[number];

const stepDetails: Record<Step, { label: string; title: string; description: string }> = {
  context: {
    label: "Context",
    title: "Tell us about your teaching context",
    description: "A few details help us keep the tutor grounded in your course.",
  },
  purpose: {
    label: "Purpose",
    title: "What is this tutor for?",
    description: "Choose the learning situation your tutor should support most often.",
  },
  objectives: {
    label: "Objectives",
    title: "What should students be able to do?",
    description: "Add the learning goals that should guide every interaction.",
  },
  assistance: {
    label: "Assistance boundaries",
    title: "Set helpful boundaries",
    description: "Decide when the tutor can share answers and how it should support reasoning.",
  },
  style: {
    label: "Style and adaptation",
    title: "How should the tutor adapt?",
    description: "Choose a teaching style that feels right for your learners.",
  },
};

const purposeOptions = [
  ["conceptual_learning", "Build conceptual understanding"],
  ["guided_practice", "Guide practice without taking over"],
  ["revision", "Support revision and recall"],
  ["exam_preparation", "Prepare for assessments"],
] as const;

const disclosureOptions = [
  ["never_reveal", "Never reveal the final answer"],
  ["reveal_after_sufficient_attempts", "Reveal after sufficient attempts"],
  ["available_in_revision_mode", "Allow in revision mode"],
] as const;

const supports = [
  ["worked_examples", "Worked examples"],
  ["visual_analogies", "Visual analogies"],
  ["step_by_step", "Step-by-step guidance"],
  ["retrieval_prompts", "Recall prompts"],
  ["teach_back", "Teach-back checks"],
] as const;

function mergeDraft(
  serverBrief: ClientProjectSnapshot["teachingBrief"],
  browserDraft: TeachingBriefDraft | null,
): TeachingBriefDraft {
  const server = serverBrief as TeachingBriefDraft;
  if (!browserDraft) return server;

  return {
    ...server,
    ...browserDraft,
    context: { ...server.context, ...browserDraft.context },
    assistanceBoundaries: {
      ...server.assistanceBoundaries,
      ...browserDraft.assistanceBoundaries,
    },
    style: { ...server.style, ...browserDraft.style },
  };
}

function patchFromDraft(draft: TeachingBriefDraft): TeachingBriefPatch | null {
  const patch: Record<string, unknown> = {};
  if (TeachingBriefContextStepSchema.safeParse(draft.context).success) patch.context = draft.context;
  if (TeachingBriefPurposeStepSchema.safeParse({ purpose: draft.purpose }).success) patch.purpose = draft.purpose;
  if (TeachingBriefObjectivesStepSchema.safeParse({ objectives: draft.objectives }).success) patch.objectives = draft.objectives;
  if (TeachingBriefAssistanceStepSchema.safeParse(draft.assistanceBoundaries).success) patch.assistanceBoundaries = draft.assistanceBoundaries;
  const style = TeachingBriefStyleStepSchema.safeParse(draft.style);
  if (style.success) patch.style = style.data;
  if (draft.completedSteps?.length) patch.completedSteps = draft.completedSteps;

  return Object.keys(patch).length > 0 ? (patch as TeachingBriefPatch) : null;
}

function validStep(step: Step, draft: TeachingBriefDraft): boolean {
  switch (step) {
    case "context": return TeachingBriefContextStepSchema.safeParse(draft.context).success;
    case "purpose": return TeachingBriefPurposeStepSchema.safeParse({ purpose: draft.purpose }).success;
    case "objectives": return TeachingBriefObjectivesStepSchema.safeParse({ objectives: draft.objectives }).success;
    case "assistance": return TeachingBriefAssistanceStepSchema.safeParse(draft.assistanceBoundaries).success;
    case "style": return TeachingBriefStyleStepSchema.safeParse(draft.style).success;
  }
}

function validationMessage(step: Step, draft: TeachingBriefDraft): string {
  if (step === "context" && !draft.context?.subject?.trim()) return "Add your subject before continuing.";
  if (step === "context") return "Complete each context detail before continuing.";
  if (step === "purpose") return "Choose the tutor's main purpose before continuing.";
  if (step === "objectives") return "Add at least one learning objective before continuing.";
  if (step === "assistance") return "Choose both answer-sharing boundaries before continuing.";
  return "Choose a tone, response length, and questioning preference before continuing.";
}

function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutPersistedValues(
  draft: TeachingBriefDraft,
  patch: TeachingBriefPatch,
): TeachingBriefDraft {
  const remaining = { ...draft };
  for (const key of Object.keys(patch) as Array<keyof TeachingBriefPatch>) {
    if (isSameValue(draft[key as keyof TeachingBriefDraft], patch[key])) {
      delete remaining[key as keyof TeachingBriefDraft];
    }
  }
  return remaining;
}

function hasDraft(draft: TeachingBriefDraft): boolean {
  return Object.keys(draft).length > 0;
}

export function TeachingBriefWizard({ project }: TeachingBriefWizardProps) {
  const [brief, setBrief] = useState<TeachingBriefDraft>(() => project.teachingBrief as TeachingBriefDraft);
  const [currentStep, setCurrentStep] = useState(0);
  const [objective, setObjective] = useState("");
  const [validationError, setValidationError] = useState("");
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const [dirty, setDirty] = useState(false);
  const briefRef = useRef(brief);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const draft = loadDraft(project.id);
    if (!draft) return;
    const recovered = mergeDraft(project.teachingBrief, draft);
    briefRef.current = recovered;
    setBrief(recovered);
    setSaveStatus("Recovered locally — save your next change to sync it.");
  }, [project.id, project.teachingBrief]);

  useEffect(() => {
    briefRef.current = brief;
  }, [brief]);

  useEffect(() => {
    if (!dirty) return;
    saveDraft(project.id, brief);
    const patch = patchFromDraft(brief);
    if (!patch) {
      setSaveStatus("Complete this step to save your changes.");
      return;
    }

    const revision = revisionRef.current;
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (!mountedRef.current) return;
        if (revision === revisionRef.current) setSaveStatus("Saving changes…");
        try {
          await saveBriefPatch(project.id, patch);
          if (!mountedRef.current || revision !== revisionRef.current) return;

          const remaining = withoutPersistedValues(briefRef.current, patch);
          if (hasDraft(remaining)) {
            saveDraft(project.id, remaining);
          } else {
            clearDraft(project.id);
          }
          setDirty(hasDraft(remaining));
          setSaveStatus(hasDraft(remaining) ? "Complete this step to save your changes." : "Saved");
        } catch {
          if (!mountedRef.current || revision !== revisionRef.current) return;
          const stored = saveDraft(project.id, briefRef.current);
          setSaveStatus(
            stored
              ? "Couldn't save. Your draft is stored in this browser."
              : "Couldn't save. Keep this page open; browser storage is unavailable.",
          );
        }
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [brief, dirty, project.id]);

  const updateBrief = (updater: (current: TeachingBriefDraft) => TeachingBriefDraft) => {
    revisionRef.current += 1;
    setBrief((current) => updater(current));
    setDirty(true);
    setValidationError("");
  };

  const step = steps[currentStep];
  const stepInfo = stepDetails[step];
  const completedCount = steps.filter((item) => validStep(item, brief)).length;

  const next = async () => {
    if (!validStep(step, brief)) {
      setValidationError(validationMessage(step, brief));
      return;
    }
    const nextBrief = {
      ...brief,
      completedSteps: Array.from(new Set([...(brief.completedSteps ?? []), step])),
    };
    updateBrief(() => nextBrief);
    if (currentStep < steps.length - 1) {
      setCurrentStep((index) => index + 1);
      return;
    }

    const patch = patchFromDraft(nextBrief);
    if (!patch) return;
    setSaveStatus("Saving changes…");
    try {
      await saveBriefPatch(project.id, patch, true);
      clearDraft(project.id);
      setDirty(false);
      setSaveStatus("Saved");
      window.location.assign(`/projects/${project.id}/sources`);
    } catch {
      saveDraft(project.id, nextBrief);
      setSaveStatus("Couldn't save. Your draft is stored in this browser.");
    }
  };

  return (
    <section className="max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-sm tracking-wide text-primary uppercase">Teaching brief</h1>
          <p className="mt-1 text-sm text-muted-foreground">About {completedCount < 5 ? "5" : "1"} minute{completedCount < 5 ? "s" : ""} remaining</p>
        </div>
        <p className="text-sm text-muted-foreground">Step {currentStep + 1} of 5</p>
      </div>

      <ol className="grid grid-cols-5 gap-2" aria-label="Teaching brief progress">
        {steps.map((item, index) => (
          <li key={item} className={index === currentStep ? "font-medium text-primary" : "text-muted-foreground"}>
            <span className="block text-xs">{index + 1}</span>
            <span className="hidden text-xs sm:block">{stepDetails[item].label}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight">{stepInfo.title}</h2>
        <p className="text-muted-foreground">{stepInfo.description}</p>
      </div>

      {step === "context" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["subject", "Subject"],
            ["topic", "Main topic"],
            ["studentLevel", "Student level"],
            ["language", "Teaching language"],
          ] as const).map(([field, label]) => (
            <label key={field} className="grid gap-2 text-sm font-medium">
              {label}
              <input
                value={brief.context?.[field] ?? ""}
                onChange={(event) => updateBrief((current) => ({
                  ...current,
                  context: { ...current.context, [field]: event.target.value },
                }))}
                className="rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
          ))}
        </div>
      )}

      {step === "purpose" && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Tutor purpose</legend>
          {purposeOptions.map(([value, label]) => (
            <label key={value} className="cursor-pointer rounded-lg border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input className="mr-2" type="radio" name="purpose" value={value} checked={brief.purpose === value} onChange={() => updateBrief((current) => ({ ...current, purpose: value }))} />
              {label}
            </label>
          ))}
        </fieldset>
      )}

      {step === "objectives" && (
        <div className="space-y-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="new-objective">Learning objective</label>
          <div className="flex flex-wrap gap-2">
            <input id="new-objective" value={objective} onChange={(event) => setObjective(event.target.value)} className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <button type="button" onClick={() => {
              const value = objective.trim();
              if (!value) return;
              updateBrief((current) => ({ ...current, objectives: [...(current.objectives ?? []), value] }));
              setObjective("");
            }} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Add objective</button>
          </div>
          <ul className="space-y-2" aria-label="Learning objectives">
            {(brief.objectives ?? []).map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                {item}
                <button type="button" aria-label={`Remove ${item}`} onClick={() => updateBrief((current) => ({ ...current, objectives: (current.objectives ?? []).filter((_, objectiveIndex) => objectiveIndex !== index) }))} className="text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "assistance" && (
        <div className="space-y-6">
          {(["defaultDisclosure", "assessedWorkDisclosure"] as const).map((field) => (
            <fieldset key={field} className="space-y-3">
              <legend className="font-medium">{field === "defaultDisclosure" ? "For regular learning" : "For assessed work"}</legend>
              {disclosureOptions.map(([value, label]) => (
                <label key={value} className="block cursor-pointer rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                  <input className="mr-2" type="radio" name={field} value={value} checked={brief.assistanceBoundaries?.[field] === value} onChange={() => updateBrief((current) => ({ ...current, assistanceBoundaries: { ...current.assistanceBoundaries, [field]: value } }))} />
                  {label}
                </label>
              ))}
            </fieldset>
          ))}
          <label className="flex items-center gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
            <input type="checkbox" checked={brief.assistanceBoundaries?.requireReasoningBeforeAnswer ?? false} onChange={(event) => updateBrief((current) => ({ ...current, assistanceBoundaries: { ...current.assistanceBoundaries, requireReasoningBeforeAnswer: event.target.checked } }))} />
            <span><span className="font-medium">Ask for reasoning first</span><span className="block text-sm text-muted-foreground">Encourage students to explain their thinking before direct help.</span></span>
          </label>
        </div>
      )}

      {step === "style" && (
        <div className="space-y-6">
          <CardChoices label="Tone" name="tone" value={brief.style?.tone} options={[["encouraging", "Encouraging"], ["neutral", "Neutral"], ["formal", "Formal"]]} onChange={(tone) => updateBrief((current) => ({ ...current, style: { ...current.style, tone } }))} />
          <CardChoices label="Response length" name="responseLength" value={brief.style?.responseLength} options={[["concise", "Concise"], ["balanced", "Balanced"], ["detailed", "Detailed"]]} onChange={(responseLength) => updateBrief((current) => ({ ...current, style: { ...current.style, responseLength } }))} />
          <CardChoices label="Teaching approach" name="questioningPreference" value={brief.style?.questioningPreference} options={[["questions_first", "Questions first"], ["balanced", "Balanced"], ["explanations_first", "Explanations first"]]} onChange={(questioningPreference) => updateBrief((current) => ({ ...current, style: { ...current.style, questioningPreference } }))} />
          <fieldset className="space-y-3"><legend className="font-medium">Learner supports</legend><div className="grid gap-2 sm:grid-cols-2">{supports.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-lg border p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"><input type="checkbox" checked={brief.style?.learnerSupports?.includes(value) ?? false} onChange={(event) => updateBrief((current) => { const selected = new Set(current.style?.learnerSupports ?? []); if (event.target.checked) { selected.add(value); } else { selected.delete(value); } return { ...current, style: { ...current.style, learnerSupports: Array.from(selected) } }; })} />{label}</label>)}</div></fieldset>
        </div>
      )}

      {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{saveStatus}</p>
      <div className="flex justify-between gap-3 border-t pt-5">
        <button type="button" disabled={currentStep === 0} onClick={() => { setCurrentStep((index) => index - 1); setValidationError(""); }} className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Back</button>
        <button type="button" onClick={next} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{currentStep === steps.length - 1 ? "Finish brief" : "Next"}</button>
      </div>
    </section>
  );
}

function CardChoices<T extends string>({ label, name, value, options, onChange }: { label: string; name: string; value: T | undefined; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <fieldset className="space-y-3"><legend className="font-medium">{label}</legend><div className="grid gap-2 sm:grid-cols-3">{options.map(([option, optionLabel]) => <label key={option} className="cursor-pointer rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"><input className="mr-2" type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />{optionLabel}</label>)}</div></fieldset>;
}
