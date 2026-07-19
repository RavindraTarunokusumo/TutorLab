# Preview Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Preview display the learner question immediately, stream rich tutor responses, and keep the transcript in a fixed, scrollable panel.

**Architecture:** Keep the existing SSE endpoint and persistence intact. The client owns temporary optimistic learner and pending tutor messages, replaces them with the final response, and renders all content through the existing Markdown/KaTeX stack. A transcript ref keeps the latest streamed text visible.

**Tech Stack:** Next.js, React, Server-Sent Events, react-markdown, remark-gfm, remark-math, rehype-katex, Vitest.

---

### Task 1: Track and test preview behavior

**Files:**
- Modify: `TODO.md`
- Create: `tests/unit/tutor-preview.test.tsx`

- [ ] Add the active TODO item for optimistic streaming, rich text, and fixed-height scrolling.
- [ ] Test that the learner message appears before the streamed tutor content and that a final reply replaces the pending reply.

### Task 2: Implement the preview interaction

**Files:**
- Modify: `src/components/chat/tutor-preview.tsx`

- [ ] Store a local pending learner/tutor turn before posting to the existing chat route.
- [ ] Append each SSE delta to the pending tutor turn, then replace the pending turn with the persisted final messages and metadata.
- [ ] Render message content with `ReactMarkdown`, `remarkGfm`, `remarkMath`, and `rehypeKatex`.
- [ ] Keep the transcript at `min(34rem, calc(100vh - 22rem))`, enable internal vertical overflow, and follow the newest reply while it streams.

### Task 3: Validate

**Files:**
- Modify: `src/components/chat/tutor-preview.tsx`
- Test: `tests/unit/tutor-preview.test.tsx`

- [ ] Run focused preview tests and ESLint.
- [ ] Run TypeScript validation and record any unrelated existing errors.

### Task 4: Show per-reply inspector details

**Files:**
- Modify: `src/components/chat/tutor-preview.tsx`
- Test: `tests/unit/tutor-preview.test.tsx`

- [ ] Derive inspector entries from every tutor message with persisted metadata, including the latest completed message.
- [ ] Format internal category identifiers in title case and render metadata values as pills.
- [ ] Omit the internal state-fallback diagnostic and verify the inspector retains details for multiple tutor replies.
