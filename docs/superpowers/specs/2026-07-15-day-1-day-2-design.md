# TutorLab Day 1–2 Design Specification

**Status:** Approved design  
**Date:** 2026-07-15  
**Scope:** SPEC Milestone Day 1 and Day 2

## 1. Outcome

Deliver a navigable, persisted TutorLab application through the course-model review stage. A teacher can create a project, complete and resume a teaching brief, upload and index course evidence, run live material analysis, inspect source-grounded structured results, correct the result, and save a teacher-edited course-model version. All seven product stages render; stages beyond Day 2 use deterministic fixtures.

## 2. Requirements

### 2.1 Foundation

- Use a single Next.js 15 App Router application with TypeScript, Tailwind CSS, shadcn/ui, Prisma, PostgreSQL, Zod, Vitest, and Playwright.
- Provide Docker Compose PostgreSQL for local development.
- Validate server environment variables at startup boundaries without exposing secret values to the client.
- Keep OpenAI access behind server-only modules using the official JavaScript SDK and Responses API.
- Provide lint, formatting, typecheck, unit/integration test, browser test, build, Prisma, and database scripts.

### 2.2 Project access and navigation

- Create a named project without user authentication.
- Issue an unguessable signed edit token in an HTTP-only, SameSite cookie and persist only verification material.
- Require project edit authorization for all project mutations.
- Persist the current and last completed stage so refreshes resume correctly.
- Render the persistent stages `Brief → Sources → Course Model → Design → Build → Report → Preview`.
- Render deterministic fixture content for stages outside Day 1–2 scope.

### 2.3 Teaching brief

- Implement five educator-facing steps: context, purpose, objectives, assistance boundaries, and style/adaptation.
- Present one principal question per panel with back/next navigation and an under-five-minute completion estimate.
- Validate partial answers with shared Zod schemas.
- Autosave after a short debounce, report saving/saved/error state, and retain a browser draft when the server is temporarily unavailable.
- Persist completed steps and allow safe resume after refresh.

### 2.4 Course evidence

- Accept one to 20 PDF, DOCX, TXT, MD, or JSON files, up to 10 MB each.
- Use the three project-owner-supplied probability documents for test and initial live verification: practice exercises, sample exam, and marking scheme.
- Do not download or substitute third-party course materials from the internet.
- Require a declared role: course material, exercises, assessment, marking scheme/rubric, or tutor trace.
- Require explicit anonymization confirmation for tutor traces and restrict traces to TXT, MD, or JSON.
- Reject unsupported, oversized, duplicate, malformed, or password-protected files with actionable messages.
- Show Uploading, Reading, Ready, and Failed as distinct states.
- Upload accepted files server-side to OpenAI Files, attach them to one project-specific vector store, and poll indexing status.
- Store provider identifiers server-side only and allow removal before analysis.

### 2.5 Material analysis

- Start analysis through an idempotent project endpoint and return a persisted job identifier.
- Use direct file inputs for holistic extraction and retain the vector store for later retrieval.
- Invoke the Material Analyst with GPT-5.6 through the Responses API using Structured Outputs.
- Validate the returned artifact with the same canonical Zod schema used by application code and tests.
- Attempt one structured-output repair after validation failure; otherwise retain safe diagnostics and expose a retryable failure.
- Produce 3–8 concepts plus prerequisites, objectives, terminology, exercises/tasks, protected solutions, rubric criteria, misconceptions, warnings, contradictions, and source references.
- Tag unsupported statements as `teacher_supplied` or `model_inferred`.
- Warn rather than block when solutions or rubrics are missing.

### 2.6 Course-model review

- Present concepts, objectives, misconceptions, and warnings in a navigable left pane.
- Present selected-item fields and source evidence in the main pane; open source details in a filename-and-passage drawer.
- Allow edits to concepts, objectives, misconceptions, and disclosure labels.
- Visibly mark teacher-edited fields.
- Save corrections as a new immutable `CourseModelVersion` with `teacherEdited=true`.
- Require explicit confirmation before regeneration discards teacher edits.

### 2.7 Accessibility and visual behavior

- Follow the SPEC visual direction: light neutral canvas, indigo/violet accents, structured cards, strong hierarchy, generous spacing, and professional creative-tool tone.
- Meet WCAG AA contrast, keyboard navigation, visible focus, reduced-motion behavior, status text plus icons, and polite live-region announcements.
- Keep responsive behavior functional from mobile layouts through desktop review panes.

## 3. Data model

### `Project`

Identity, name, slug, edit-token verification material, status, current stage, last completed stage, teaching-brief JSON, vector-store ID, timestamps.

### `SourceDocument`

Project relationship, original name, role, MIME type, size, OpenAI file ID, upload/index status, failure code/message, trace-anonymization confirmation, timestamps.

### `CourseModelVersion`

Project relationship, monotonic version, schema version, course-model JSON, teacher-edited flag, provenance metadata, timestamps. Versions are immutable.

### `PipelineJob`

Project relationship, stage, idempotency key, provider response ID, status, attempt count, safe diagnostic metadata, usage/latency metadata, start/completion timestamps. The project-stage/idempotency tuple is unique.

JSON artifacts carry their own `schemaVersion`; relational columns own identity, lifecycle, authorization, and queryable status.

## 4. Canonical interfaces

### Application schemas

- `TeachingBriefSchema` and partial step schemas.
- `SourceDocumentRoleSchema`, upload metadata, and indexing status schemas.
- `CourseModelSchema` with stable item IDs, provenance, source references, warnings, and disclosure labels.
- `CourseModelPatchSchema` limited to teacher-editable fields.
- `PipelineJobSchema` for polling responses.

### HTTP surface

- `POST /api/projects`: create project and edit session.
- `PATCH /api/projects/:id/brief`: validated partial autosave.
- `POST /api/projects/:id/files`: validate, upload, and begin indexing.
- `DELETE /api/projects/:id/files/:fileId`: remove before analysis.
- `POST /api/projects/:id/analyze`: idempotently start material analysis.
- `GET /api/jobs/:jobId`: return persisted progress or result linkage.
- `GET /api/projects/:id/course-model`: return the latest authorized version.
- `PATCH /api/projects/:id/course-model`: validate corrections and create a version.
- Future-stage fixture handlers preserve the SPEC endpoint shapes without performing paid work.

## 5. Workflows

### Project and brief

Create project → set edit cookie → enter stage shell → answer a brief step → validate locally → debounce autosave → validate and persist server-side → update resume state.

### Upload and indexing

Select file and role → validate browser hints → validate authoritatively on server → create metadata → upload to OpenAI → create/reuse vector store → attach file → poll provider status → persist Ready or Failed.

### Analysis

Check prerequisites → claim idempotent job → submit background Responses request → poll provider → parse Structured Output → validate Zod schema → optionally repair once → create `CourseModelVersion` → complete job → advance project stage.

### Teacher correction

Load latest version → select structured item → inspect source evidence → edit allowed fields → validate patch → transactionally create the next version → mark edited provenance → refresh latest version.

## 6. Error handling and privacy

- Use stable error codes with educator-facing messages; do not expose stack traces or provider payloads.
- Retry transient network failures up to three times with exponential backoff and respect rate-limit hints up to 30 seconds.
- Treat indexing delays as pollable states, not immediate failures.
- Make duplicate mutation requests safe through idempotency.
- Never log uploaded contents, plaintext edit tokens, API keys, or full source passages.
- Treat uploaded text as untrusted evidence, never as system instructions.
- Reject unauthenticated or cross-project access with non-revealing responses.
- Keep raw source files only for the demo project lifecycle.

## 7. Verification

### Unit

- Environment, edit-token, upload, teaching-brief, course-model, patch, and job schemas.
- File count/type/size/trace rules and source-reference requirements.
- Course-model version numbering and teacher-edit allowlist.

### Integration

- Project creation through persisted brief resume.
- Upload metadata and indexing transitions with mocked OpenAI calls.
- Idempotent analysis and polling with mocked Responses Structured Output.
- Schema repair/failure behavior and immutable teacher-correction versions.
- Authorization failure paths.

### Browser

- Create project, finish wizard, upload the three supplied fixture documents, load fixture analysis in explicit test mode, inspect evidence, edit a misconception/disclosure label, save, refresh, and confirm persistence.
- Verify keyboard navigation, focus behavior, upload announcements, responsive layouts, and all seven stage routes.

### Live

- Run the three-document curated probability pack against the live API and confirm valid source-grounded output, warnings behavior, persistence, and editable review. Live mode is the normal development default; fixture mode requires an explicit test/demo switch.
- Before final submission, exercise the ingestion and review flow with 10–20 representative documents in one project.

## 8. Success criteria

- Docker-backed local setup reaches a healthy application and database.
- A project can be created and reopened through its edit session.
- Wizard data persists and resumes after refresh.
- Every stage route renders, with fixture data beyond Day 2.
- Three valid probability documents reach Ready in one project vector store during automated and initial live verification.
- One project can accept, index, and review 20 valid documents for final-submission readiness.
- Live analysis produces a schema-valid course model with source references.
- Missing solution/rubric evidence creates warnings instead of blocking.
- Teacher corrections persist as a new course-model version.
- Lint, typecheck, full test suite, relevant browser tests, and production build pass.

## 9. Constraints and exclusions

- Do not implement Day 3+ live generation, compilation, tutoring, evaluation, publishing, or export behavior.
- Do not add accounts, production administration, LMS integration, persistent learner models, fine-tuning, or realtime voice.
- Do not introduce microservices, queues, a second file-storage pipeline, or compatibility shims.
- Keep provider calls mockable and all provider identifiers private.
- Use native implementation subagents for this task; do not use Grok.
