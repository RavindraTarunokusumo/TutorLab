# Standalone Tutor Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the active tutor as a safe, standalone Next.js chatbot ZIP from a final workspace stage.

**Architecture:** A server-only export service gathers the active tutor specification, compact course model, and student-permitted structured source context. It generates a fixed set of standalone application files and returns either a file manifest or ZIP bytes. The client displays the manifest, tooltips, and a download control; Preview advances the project to the new final Export stage.

**Tech Stack:** Next.js App Router, React, TypeScript, JSZip, Prisma repositories, Zod, Vitest.

---

### Task 1: Add the Export stage

**Files:**
- Modify: `src/lib/schemas/project.ts`, `src/lib/projects/stages.ts`, `src/lib/projects/route-artifacts.ts`, `src/components/projects/project-workspace.tsx`, `src/components/projects/stage-header.tsx`
- Create: `src/app/projects/[projectId]/export/page.tsx`, `src/app/api/projects/[projectId]/advance-export/route.ts`

- [ ] Add `export` after `preview` in the stage schema and header, require an active tutor for access, and render the new workspace screen.
- [ ] Provide an authorized advance route that sets the project stage to `export`.

### Task 2: Generate a safe portable package

**Files:**
- Create: `src/lib/export/standalone-tutor-package.ts`, `src/app/api/projects/[projectId]/export/route.ts`
- Test: `tests/unit/standalone-tutor-package.test.ts`

- [ ] Load the active tutor, its course model, sources, and current analyses.
- [ ] Export only non-protected, runtime-retrievable, student-visible source summaries and findings; never export raw uploaded files, provider IDs, compiled prompt, evaluator artifacts, or secrets.
- [ ] Generate `package.json`, `.env.example`, app and API templates, tutor data, knowledge context, and `README.md`; ZIP them with JSZip.
- [ ] Return a JSON manifest for inspection and ZIP bytes with a download disposition.

### Task 3: Build the Export UI and Preview handoff

**Files:**
- Create: `src/components/export/standalone-tutor-export.tsx`
- Modify: `src/components/chat/tutor-preview.tsx`
- Test: `tests/unit/standalone-tutor-export.test.tsx`

- [ ] Add the Preview handoff that advances the stage then navigates to Export.
- [ ] Show package files as separate cards with accessible hover descriptions, README preview, and ZIP download.
- [ ] Keep errors visible and disable action controls while a request is in progress.

### Task 4: Verify

**Files:**
- Test: `tests/unit/standalone-tutor-package.test.ts`, `tests/unit/standalone-tutor-export.test.tsx`

- [ ] Run the two new focused test files plus the existing Preview component test and lint the touched production files.
- [ ] Run TypeScript validation once and report only unrelated existing failures if present.
