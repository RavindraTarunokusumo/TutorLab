"use client";

import { useState } from "react";

export function ProjectLauncher({ fixtureMode }: { fixtureMode: boolean }) {
  const [name, setName] = useState("Probability workshop");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function createProject() {
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => null);
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

  return (
    <section className="mt-9 max-w-xl rounded-2xl border bg-background/70 p-2 shadow-[0_16px_44px_-28px_oklch(0.31_0.09_284.8/0.4)]">
      <div className="px-3 pt-3 sm:px-4">
        <h2 className="text-sm font-semibold text-foreground">
          {fixtureMode ? "Fixture-mode project" : "Create a tutor project"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Start with a working title. You can refine every decision as you
          build.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          aria-label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-12 min-w-0 flex-1 rounded-xl border bg-card px-4 text-base shadow-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button
          type="button"
          disabled={creating || !name.trim()}
          onClick={() => void createProject()}
          className="min-h-12 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-primary/90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50"
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
    </section>
  );
}
