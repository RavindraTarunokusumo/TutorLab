"use client";

import { useEffect, useState } from "react";
import { TutorPreview } from "./tutor-preview";

export function PreviewStage({ projectId, conceptName }: { projectId: string; conceptName?: string }) {
  const [tutorVersionId, setTutorVersionId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/compile`)
      .then(async (response) => response.ok ? response.json() as Promise<{ tutorVersion: { id: string } | null }> : null)
      .then((payload) => setTutorVersionId(payload?.tutorVersion?.id ?? null))
      .catch(() => setTutorVersionId(null));
  }, [projectId]);

  if (tutorVersionId) return <TutorPreview projectId={projectId} tutorVersionId={tutorVersionId} />;
  return <section className="max-w-3xl space-y-5"><h1 className="text-3xl font-semibold tracking-tight">Tutor preview</h1><article className="rounded-xl border bg-card p-5 shadow-sm"><p className="font-medium">Compile a tutor design first, then return here to test it.</p><p className="mt-3 text-sm text-muted-foreground">Grounded in: {conceptName ?? "the course model"}</p></article></section>;
}
