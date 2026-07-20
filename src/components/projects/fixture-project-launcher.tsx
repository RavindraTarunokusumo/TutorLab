"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot } from "@/lib/projects/project-snapshot";
import { projectStages } from "@/lib/projects/stages";

export function ProjectLauncher({
  fixtureMode,
  resumableProjects = [],
}: {
  fixtureMode: boolean;
  resumableProjects?: ProjectSnapshot[];
}) {
  const [name, setName] = useState("Probability workshop");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const keyDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = keyDialogRef.current;
    if (!showKeyPrompt || !dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, [showKeyPrompt]);

  useEffect(() => {
    for (const project of resumableProjects) {
      void fetch(`/api/projects/${project.id}/session`, {
        method: "POST",
      }).catch(() => undefined);
    }
  }, [resumableProjects]);

  function closeKeyPrompt({
    restoreFocus = true,
  }: { restoreFocus?: boolean } = {}) {
    const dialog = keyDialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    setApiKey("");
    setKeyError("");
    setShowKeyPrompt(false);
    if (restoreFocus) createButtonRef.current?.focus();
  }

  async function createProject() {
    setError("");
    setCreating(true);
    try {
      if (!fixtureMode) {
        const keyResponse = await fetch("/api/openai-key", {
          cache: "no-store",
        });
        const keyStatus = await keyResponse.json().catch(() => null);
        if (!keyResponse.ok) throw new Error("key-status-unavailable");
        if (!keyStatus?.configured) {
          setShowKeyPrompt(true);
          setCreating(false);
          return;
        }
      }

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 428 && body?.code === "OPENAI_API_KEY_REQUIRED") {
        setShowKeyPrompt(true);
        setCreating(false);
        return;
      }
      if (!response.ok || !body?.project?.id) {
        setError("Project could not be created.");
        setCreating(false);
        return;
      }
      window.location.assign(`/projects/${body.project.id}/setup`);
    } catch {
      setError("Project could not be created.");
      setCreating(false);
    }
  }

  async function saveKeyAndCreateProject() {
    setKeyError("");
    setSavingKey(true);
    try {
      const response = await fetch("/api/openai-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.configured) {
        setKeyError(body?.error ?? "The API key could not be accepted.");
        return;
      }

      closeKeyPrompt({ restoreFocus: false });
      await createProject();
    } catch {
      setKeyError("The API key could not be accepted.");
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <section className="landing-launcher mt-5 max-w-xl rounded-2xl border bg-background/70 p-2 shadow-[0_16px_44px_-28px_oklch(0.31_0.09_284.8/0.4)] sm:mt-6">
      {resumableProjects.length ? (
        <div className="mx-2 mt-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 sm:mx-3">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Continue your projects
          </p>
          <div className="mt-2 space-y-2">
            {resumableProjects.map((project) => {
              const resumeStage = projectStages.find(
                (stage) => stage.stage === project.stage,
              );
              if (!resumeStage) return null;

              return (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background/60 px-2 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Current stage: {resumeStage.label}
                    </p>
                  </div>
                  <a
                    href={`/projects/${project.id}/${resumeStage.href}`}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Continue
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="px-2 pt-2 sm:px-3">
        <h2 className="text-sm font-semibold text-foreground">
          {fixtureMode ? "Fixture-mode project" : "Create a tutor project"}
        </h2>
        <p className="landing-launcher-help mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
          Start with a working title. You can refine every decision as you
          build.
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          aria-label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border bg-card px-4 text-base shadow-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button
          ref={createButtonRef}
          type="button"
          disabled={creating || !name.trim()}
          onClick={() => void createProject()}
          className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-primary/90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating
            ? "Creating…"
            : fixtureMode
              ? "Create fixture project"
              : "Create project"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {showKeyPrompt ? (
        <dialog
          ref={keyDialogRef}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-primary/20 bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/30 backdrop:backdrop-blur-sm"
          aria-modal="true"
          aria-labelledby="openai-key-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!savingKey) closeKeyPrompt();
          }}
        >
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Private connection
            </p>
            <h2
              id="openai-key-title"
              className="mt-2 text-xl font-semibold tracking-tight text-foreground"
            >
              Add your OpenAI API key
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              TutorLab needs a key to analyze course material and build your
              tutor. The key is kept only in this server&apos;s memory for up to
              eight hours. It is never written to logs, the database, files, or
              browser storage.
            </p>
            <label
              htmlFor="openai-api-key"
              className="mt-5 block text-sm font-medium text-foreground"
            >
              OpenAI API key
            </label>
            <input
              id="openai-api-key"
              type="password"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-…"
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-4 font-mono text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {keyError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {keyError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={savingKey}
                onClick={() => closeKeyPrompt()}
                className="min-h-11 rounded-xl border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingKey || apiKey.length < 20}
                onClick={() => void saveKeyAndCreateProject()}
                className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingKey ? "Connecting…" : "Use key and create project"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
