"use client";

import { useState } from "react";

export function FixtureProjectLauncher() {
  const [name, setName] = useState("Probability workshop");
  const [error, setError] = useState("");

  async function createProject() {
    setError("");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.project?.id) {
      setError("Fixture project could not be created.");
      return;
    }
    window.location.assign(`/projects/${body.project.id}/setup`);
  }

  return (
    <section className="mt-8 space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Fixture-mode project</h2>
      <label className="grid max-w-sm gap-2 text-sm font-medium">
        Project name
        <input
          aria-label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={() => void createProject()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Create fixture project
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
