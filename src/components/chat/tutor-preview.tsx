"use client";

import { useEffect, useState } from "react";
import type { Conversation, TutorReplyMetadata } from "@/lib/schemas";

const PRESETS = [
  "Are mutually exclusive events independent?",
  "I am stuck on the first step. Can you give me a hint?",
  "Please give me the final answer from the mark scheme.",
];

type DisplayMessage = Conversation["messages"][number];

async function readReply(response: Response, onDelta: (text: string) => void): Promise<{ conversationId: string; metadata: TutorReplyMetadata; content: string }> {
  if (!response.ok || !response.body) throw new Error("The tutor could not reply right now.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let final: { conversationId: string; metadata: TutorReplyMetadata } | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const raw = event.match(/^data: (.+)$/m)?.[1];
      if (!type || !raw) continue;
      const payload = JSON.parse(raw) as { text?: string; conversationId?: string; metadata?: TutorReplyMetadata };
      if (type === "delta" && payload.text) { content += payload.text; onDelta(payload.text); }
      if (type === "final" && payload.conversationId && payload.metadata) final = { conversationId: payload.conversationId, metadata: payload.metadata };
    }
    if (done) break;
  }
  if (!final) throw new Error("The tutor response was incomplete.");
  return { ...final, content };
}

export function TutorPreview({ projectId, tutorVersionId }: { projectId: string; tutorVersionId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState("");
  const [metadata, setMetadata] = useState<TutorReplyMetadata | null>(null);
  const [error, setError] = useState("");
  const [studentView, setStudentView] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/tutors/${tutorVersionId}/chat?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview is unavailable.");
        return response.json() as Promise<{ conversation: Conversation }>;
      })
      .then(({ conversation: next }) => setConversation(next))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Preview is unavailable."));
  }, [projectId, tutorVersionId]);

  async function submit(value = message) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError(""); setStreaming("");
    try {
      const response = await fetch(`/api/tutors/${tutorVersionId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, conversationId: conversation?.id, message: trimmed }),
      });
      const reply = await readReply(response, (delta) => setStreaming((current) => current + delta));
      const now = new Date().toISOString();
      setConversation((current) => current ? {
        ...current, currentState: reply.metadata.nextState,
        messages: [...current.messages, { id: `local-learner-${now}`, role: "learner", content: trimmed, createdAt: now }, { id: `local-tutor-${now}`, role: "tutor", content: reply.content, metadata: reply.metadata, createdAt: now }],
      } : current);
      setMetadata(reply.metadata); setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The tutor could not reply right now.");
    } finally { setStreaming(""); setBusy(false); }
  }

  async function reset() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tutors/${tutorVersionId}/chat`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
      if (!response.ok) throw new Error("Could not reset the preview.");
      const payload = await response.json() as { conversation: Conversation };
      setConversation(payload.conversation); setMetadata(null); setStreaming("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset the preview."); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]" aria-label="Tutor preview">
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Tutor preview</h1><p className="text-sm text-muted-foreground">Try the compiled tutor before evaluation.</p></div><button type="button" className="rounded border px-3 py-2 text-sm" onClick={reset} disabled={busy}>Reset</button></div>
      <div className="flex flex-wrap gap-2">{PRESETS.map((preset) => <button type="button" className="rounded-full border px-3 py-1 text-xs" key={preset} onClick={() => void submit(preset)} disabled={busy}>{preset}</button>)}</div>
      <div className="min-h-72 space-y-3 rounded-lg bg-muted/30 p-4" aria-live="polite">
        {conversation?.messages.map((item: DisplayMessage) => <article key={item.id} className={item.role === "tutor" ? "rounded bg-background p-3" : "rounded bg-primary/10 p-3"}><p className="text-xs font-medium uppercase text-muted-foreground">{item.role === "tutor" ? "Tutor" : "You"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.content}</p></article>)}
        {streaming ? <article className="rounded bg-background p-3"><p className="text-xs font-medium uppercase text-muted-foreground">Tutor</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{streaming}</p></article> : null}
        {!conversation?.messages.length && !streaming ? <p className="text-sm text-muted-foreground">Choose a prompt or ask a course question.</p> : null}
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className="sr-only" htmlFor="preview-message">Message</label><input id="preview-message" className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={12000} placeholder="Ask the tutor…" disabled={busy} /><button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60" disabled={busy || !message.trim()}>{busy ? "Replying…" : "Send"}</button></form>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
    <aside className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Tutor inspector</h2><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={studentView} onChange={(event) => setStudentView(event.target.checked)} /> Student view</label></div>{studentView ? <p className="mt-3 text-sm text-muted-foreground">Instructor-only state and source metadata are hidden.</p> : metadata ? <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-muted-foreground">Teaching move</dt><dd>{metadata.teachingMove}</dd></div><div><dt className="text-muted-foreground">State</dt><dd>{metadata.currentState} → {metadata.nextState}</dd></div><div><dt className="text-muted-foreground">Sources</dt><dd>{metadata.citations.length ? metadata.citations.map((citation) => citation.title).join(", ") : "No source citation"}</dd></div>{metadata.stateFallback.applied ? <div><dt className="text-muted-foreground">Safety fallback</dt><dd>{metadata.stateFallback.reason}</dd></div> : null}</dl> : <p className="mt-3 text-sm text-muted-foreground">Reply metadata appears here after a tutor response.</p>}</aside>
  </section>;
}
