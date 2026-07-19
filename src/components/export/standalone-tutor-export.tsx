"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, FileCode, FileJson, FileText } from "lucide-react";

type ExportFile = { path: string; purpose: string; preview: string };
type ExportManifest = { name: string; files: ExportFile[] };

function FileTypeIcon({ path }: { path: string }) {
  const Icon = path.endsWith(".json") ? FileJson : path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".mjs") ? FileCode : FileText;
  return <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />;
}

function TutorLabMark() {
  return <Image src="/tutorlab-logo-transparent.png" alt="TutorLab" width={304} height={96} className="h-16 w-auto object-contain" priority />;
}

export function StandaloneTutorExport({ projectId }: { projectId: string }) {
  const [manifest, setManifest] = useState<ExportManifest | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/export`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "The package could not be prepared.");
        return response.json() as Promise<ExportManifest>;
      })
      .then(setManifest)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The package could not be prepared."));
  }, [projectId]);

  if (error) return <section className="max-w-3xl space-y-4"><h1 className="text-3xl font-semibold tracking-tight">Export standalone tutor</h1><p className="text-sm text-destructive" role="alert">{error}</p></section>;
  if (!manifest) return <section className="max-w-3xl rounded-xl border bg-card p-6 shadow-sm"><h1 className="text-2xl font-semibold">Preparing export package</h1><p className="mt-2 text-sm text-muted-foreground">Collecting the portable tutor policy and permitted course context.</p></section>;

  return <section className="space-y-6"><div><p className="text-sm text-muted-foreground">Final stage</p><h1 className="text-3xl font-semibold tracking-tight">Export standalone tutor</h1><p className="mt-2 max-w-3xl text-muted-foreground">Download a deployable chatbot with the active tutor policy and student-permitted course context. Protected source content, provider data, and secrets are excluded.</p></div><a className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90" href={`/api/projects/${projectId}/export?download=1`}><Download aria-hidden="true" className="size-4" />Download</a><div><h2 className="mb-3 font-semibold">Package files</h2><div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]"><div className="space-y-3">{manifest.files.map((file) => <article key={file.path} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex gap-3"><FileTypeIcon path={file.path} /><div><p className="font-mono text-sm font-medium">{file.path}</p><p className="mt-1 text-sm text-muted-foreground">{file.purpose}</p></div></div></article>)}</div><aside className="flex h-full min-h-0 flex-col rounded-xl border bg-card p-5 shadow-sm"><h2 className="shrink-0 font-semibold">Implementation handoff</h2><div className="mt-3 space-y-4 text-sm leading-6 text-muted-foreground"><p>These files are intended for a developer or coding agent. Follow <span className="font-mono text-foreground">README.md</span> to integrate the tutor into an existing system as a chatbot feature, or deploy it as a standalone chatbot app.</p><div><p>The package contains the tutor policy and permitted course context. It does <strong className="font-semibold text-foreground">not</strong> include:</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Session management or long-term memory</li><li>Tool use, authentication, or analytics</li><li>A vector database or source indexing pipeline</li><li>Other host-application capabilities</li></ul></div><p>Use the package as a focused tutor feature, then connect it to your product’s own infrastructure and conventions.</p></div><div className="mt-auto border-t pt-5"><p className="mb-3 text-base text-muted-foreground">Thank you for building with</p><TutorLabMark /></div></aside></div></div></section>;
}
