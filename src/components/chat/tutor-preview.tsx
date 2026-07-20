"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Conversation, TutorReplyMetadata } from "@/lib/schemas";

type DisplayMessage = Conversation["messages"][number];

function messageMarkdown(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n$$${math}$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);
}

function MessageContent({ content }: { content: string }) {
  return <div className="mt-1 break-words text-sm leading-6 [&_p]:my-2 [&_pre]:overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{messageMarkdown(content)}</ReactMarkdown></div>;
}

function displayLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function boundaryLabel(value: TutorReplyMetadata["boundary"]) {
  return value === "none" ? "In Scope" : displayLabel(value);
}

function InspectorPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{children}</span>;
}

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
  const [pendingLearner, setPendingLearner] = useState<DisplayMessage | null>(null);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinkingDots, setThinkingDots] = useState(1);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTranscriptRef = useRef(true);

  useEffect(() => {
    fetch(`/api/tutors/${tutorVersionId}/chat?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview is unavailable.");
        return response.json() as Promise<{ conversation: Conversation }>;
      })
      .then(({ conversation: next }) => setConversation(next))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Preview is unavailable."));
  }, [projectId, tutorVersionId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && followTranscriptRef.current) transcript.scrollTop = transcript.scrollHeight;
  }, [conversation?.messages, pendingLearner, streaming]);

  useEffect(() => {
    if (!busy || streaming) {
      setThinkingDots(1);
      return;
    }
    const interval = window.setInterval(() => setThinkingDots((dots) => dots % 3 + 1), 500);
    return () => window.clearInterval(interval);
  }, [busy, streaming]);

  async function submit(value = message) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    const now = new Date().toISOString();
    const learner: DisplayMessage = { id: `local-learner-${now}`, role: "learner", content: trimmed, createdAt: now };
    setBusy(true); setError(""); setStreaming(""); setPendingLearner(learner);
    try {
      const response = await fetch(`/api/tutors/${tutorVersionId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, conversationId: conversation?.id, message: trimmed }),
      });
      const reply = await readReply(response, (delta) => setStreaming((current) => current + delta));
      setConversation((current) => current ? {
        ...current, currentState: reply.metadata.nextState,
        messages: [...current.messages, learner, { id: `local-tutor-${now}`, role: "tutor", content: reply.content, metadata: reply.metadata, createdAt: new Date().toISOString() }],
      } : current);
      setMessage("");
    } catch (caught) {
      setConversation((current) => current ? { ...current, messages: [...current.messages, learner] } : current);
      setError(caught instanceof Error ? caught.message : "The tutor could not reply right now.");
    } finally { setPendingLearner(null); setStreaming(""); setBusy(false); }
  }

  async function reset() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tutors/${tutorVersionId}/chat`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
      if (!response.ok) throw new Error("Could not reset the preview.");
      const payload = await response.json() as { conversation: Conversation };
      setConversation(payload.conversation); setPendingLearner(null); setStreaming("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset the preview."); }
    finally { setBusy(false); }
  }

  async function proceedToExport() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/advance-export`, { method: "POST" });
      if (!response.ok) throw new Error("Could not open the export stage.");
      window.location.href = `/projects/${projectId}/export`;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open the export stage."); setBusy(false); }
  }

  const tutorReplies = conversation?.messages.filter((item): item is DisplayMessage & { metadata: TutorReplyMetadata } => item.role === "tutor" && Boolean(item.metadata)) ?? [];

  return <section className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]" aria-label="Tutor preview">
    <div className="flex min-h-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Tutor Preview</h1><p className="text-sm text-muted-foreground">Try the compiled tutor before evaluation.</p></div><button type="button" className="rounded-2xl border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-60" onClick={reset} disabled={busy}>Reset</button></div>
      <div ref={transcriptRef} onScroll={(event) => { const element = event.currentTarget; followTranscriptRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24; }} className="scrollbar-hidden min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-4" aria-live="polite">
        {conversation?.messages.map((item: DisplayMessage) => <article key={item.id} className={item.role === "tutor" ? "rounded bg-background p-3" : "rounded bg-primary/10 p-3"}><p className="text-xs font-medium uppercase text-muted-foreground">{item.role === "tutor" ? "Tutor" : "You"}</p><MessageContent content={item.content} /></article>)}
        {pendingLearner ? <article className="rounded bg-primary/10 p-3"><p className="text-xs font-medium uppercase text-muted-foreground">You</p><MessageContent content={pendingLearner.content} /></article> : null}
        {busy ? <article className="rounded bg-background p-3"><p className="text-xs font-medium uppercase text-muted-foreground">Tutor</p>{streaming ? <MessageContent content={streaming} /> : <p className="mt-1 text-sm text-muted-foreground" aria-label="Tutor is thinking">Thinking{".".repeat(thinkingDots)}</p>}</article> : null}
        {!conversation?.messages.length && !pendingLearner ? <p className="text-sm text-muted-foreground">Ask a course question to begin.</p> : null}
      </div>
      <form className="flex shrink-0 gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className="sr-only" htmlFor="preview-message">Message</label><input id="preview-message" className="min-w-0 flex-1 rounded-2xl border bg-background px-3 py-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={12000} placeholder="Ask the tutor…" disabled={busy} /><button className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60" disabled={busy || !message.trim()}>{busy ? "Replying…" : "Send"}</button></form>
      <button type="button" className="shrink-0 self-start rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60" onClick={() => void proceedToExport()} disabled={busy}>Proceed to Export</button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
    <aside className="flex h-full min-h-0 self-stretch flex-col overflow-hidden rounded-xl border bg-card p-5 shadow-sm"><h2 className="shrink-0 font-semibold">Tutor Inspector</h2>{tutorReplies.length ? <ol className="scrollbar-hidden mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-label="Tutor reply details">{tutorReplies.map((reply, index) => <li key={reply.id} className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">Tutor Reply {index + 1}</p><div className="mt-3 flex flex-wrap gap-2"><InspectorPill>{displayLabel(reply.metadata.teachingMove)}</InspectorPill><InspectorPill>{displayLabel(reply.metadata.currentState)} → {displayLabel(reply.metadata.nextState)}</InspectorPill><InspectorPill>{boundaryLabel(reply.metadata.boundary)}</InspectorPill>{reply.metadata.citations.length ? reply.metadata.citations.map((citation) => <InspectorPill key={citation.documentId}>{citation.title}</InspectorPill>) : <InspectorPill>No Source Citation</InspectorPill>}</div></li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Reply details appear here after a tutor response.</p>}</aside>
  </section>;
}
