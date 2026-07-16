import type {
  TeachingBriefAssistanceStepSchema,
  TeachingBriefContextStepSchema,
  TeachingBriefObjectivesStepSchema,
  TeachingBriefStyleStepSchema,
} from "@/lib/schemas/teaching-brief";
import type { z } from "zod";

type ContextDraft = Partial<z.infer<typeof TeachingBriefContextStepSchema>>;
type AssistanceDraft = Partial<z.infer<typeof TeachingBriefAssistanceStepSchema>>;
type StyleDraft = Partial<z.infer<typeof TeachingBriefStyleStepSchema>>;

export type TeachingBriefDraft = {
  context?: ContextDraft;
  purpose?: "conceptual_learning" | "guided_practice" | "revision" | "exam_preparation";
  objectives?: z.infer<typeof TeachingBriefObjectivesStepSchema>["objectives"];
  assistanceBoundaries?: AssistanceDraft;
  style?: StyleDraft;
  completedSteps?: Array<"context" | "purpose" | "objectives" | "assistance" | "style">;
};

function storageKey(projectId: string) {
  return `tutorlab:teaching-brief:${projectId}`;
}

export function loadDraft(projectId: string): TeachingBriefDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey(projectId));
    if (!stored) {
      return null;
    }
    return normalizeDraft(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function saveDraft(projectId: string, patch: TeachingBriefDraft): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(patch));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(projectId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.removeItem(storageKey(projectId));
    return true;
  } catch {
    return false;
  }
}

function normalizeDraft(value: unknown): TeachingBriefDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const draft: TeachingBriefDraft = {};

  if (isRecord(raw.context)) {
    const context: ContextDraft = {};
    for (const key of ["subject", "topic", "studentLevel", "language"] as const) {
      if (typeof raw.context[key] === "string") {
        context[key] = raw.context[key];
      }
    }
    if (Object.keys(context).length > 0) {
      draft.context = context;
    }
  }

  if (isOneOf(raw.purpose, ["conceptual_learning", "guided_practice", "revision", "exam_preparation"])) {
    draft.purpose = raw.purpose;
  }
  if (Array.isArray(raw.objectives) && raw.objectives.every((item) => typeof item === "string")) {
    draft.objectives = raw.objectives;
  }
  if (isRecord(raw.assistanceBoundaries)) {
    const assistance: AssistanceDraft = {};
    for (const key of ["defaultDisclosure", "assessedWorkDisclosure"] as const) {
      if (isOneOf(raw.assistanceBoundaries[key], ["never_reveal", "reveal_after_sufficient_attempts", "available_in_revision_mode"])) {
        assistance[key] = raw.assistanceBoundaries[key];
      }
    }
    if (typeof raw.assistanceBoundaries.requireReasoningBeforeAnswer === "boolean") {
      assistance.requireReasoningBeforeAnswer = raw.assistanceBoundaries.requireReasoningBeforeAnswer;
    }
    if (Object.keys(assistance).length > 0) {
      draft.assistanceBoundaries = assistance;
    }
  }
  if (isRecord(raw.style)) {
    const style: StyleDraft = {};
    if (isOneOf(raw.style.tone, ["encouraging", "neutral", "formal"])) style.tone = raw.style.tone;
    if (isOneOf(raw.style.responseLength, ["concise", "balanced", "detailed"])) style.responseLength = raw.style.responseLength;
    if (isOneOf(raw.style.questioningPreference, ["questions_first", "balanced", "explanations_first"])) style.questioningPreference = raw.style.questioningPreference;
    if (Array.isArray(raw.style.learnerSupports) && raw.style.learnerSupports.every((item) => isOneOf(item, ["worked_examples", "visual_analogies", "step_by_step", "retrieval_prompts", "teach_back"]))) {
      style.learnerSupports = raw.style.learnerSupports;
    }
    if (Object.keys(style).length > 0) {
      draft.style = style;
    }
  }
  if (Array.isArray(raw.completedSteps) && raw.completedSteps.every((item) => isOneOf(item, ["context", "purpose", "objectives", "assistance", "style"]))) {
    draft.completedSteps = raw.completedSteps;
  }

  return Object.keys(draft).length > 0 ? draft : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}
