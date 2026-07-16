# System Architecture

TutorLab is a Next.js App Router application. Day 1–2 covers project setup through a compact, teacher-editable course model; later tutor-design stages render deterministic placeholders only.

## Entry points and modules

- `src/app/`: project pages and API route handlers. The seven-stage workspace is Brief → Sources → Course Model → Design → Build → Report → Preview.
- `src/lib/projects/`: project creation, signed edit-session checks, teaching-brief persistence, and stage snapshots.
- `src/lib/sources/`: source validation, budgets, metadata persistence, OpenAI-file ingestion, and source UI client calls.
- `src/lib/analysis/`: per-document analysis jobs and compact incremental course synthesis.
- `src/lib/ai/`: server-only OpenAI adapters and structured-output prompts. Provider IDs never leave these server-side workflows.
- `src/lib/schemas/`: canonical Zod contracts shared by routes, services, and tests.

## Evidence flow

`SourceDocument → DocumentAnalysis → CourseModelVersion`

1. A teacher supplies up to 30 course documents and declares role, authority, permissions, and protected-solution status.
2. The server enforces file/workspace budgets, hashes and persists source metadata, then uploads and indexes the file in that project’s OpenAI vector store.
3. Ready, course-model-permitted sources are independently analyzed with a concurrency limit of three. Each result is cached by content hash, schema version, and analysis profile.
4. Synthesis consumes structured analyses—not raw source text—to create an immutable compact `CourseModelVersion` with source references, coverage, warnings, and pedagogical evidence.
5. Teacher corrections create a new immutable version; they never mutate earlier versions.

## Tutor build, preview, and evaluation flow

`CourseModelVersion → TutorDesignSet → TutorVersion → EvalScenarioSet → EvalRun → EvalResult`

1. The Architect produces exactly three evidence-backed designs from the compact course model and teaching brief. The teacher selects one and adjusts the approved controls.
2. Compilation creates an immutable tutor version with server-only policy instructions. The preview runtime uses that version, permitted runtime sources, and the transition validator; protected solutions never enter retrieval.
3. Scenario generation persists exactly six required scenarios. The evaluator executes them independently with a concurrency limit of three, records deterministic checks before any judge result, and leaves hard deterministic failures authoritative.
4. The Report stage loads the latest persisted run, shows failed/error scenarios first, and exposes findings only through transcript-turn references. Day 3–4 records evaluation evidence; it does not apply repairs.

## Runtime behavior

Project mutations require an HTTP-only signed edit cookie. The database stores verification material only, not the plaintext token. Route handlers authorize before loading or changing project-scoped resources.

`PipelineJob` tracks analysis progress and safe retry diagnostics. There is no separate worker service in this milestone: route-triggered orchestration persists state so the UI can poll it.

## OpenAI boundary

OpenAI Files/vector stores supply retrieval text for ingestion and analysis. Responses structured output supplies document analysis and course synthesis. Tests inject mock providers/adapters; automated tests make no live OpenAI calls. Failed provider work records safe, retryable messages rather than provider payloads.

## Invariants

- Source limits are 30 files, 500 pages, 2 million extracted tokens, 50 MB per file, and 200 MB per course workspace.
- `CourseModel` is a compact synthesis: raw documents, chunks, slide summaries, and complete worked solutions remain out of it.
- Source permissions govern modelling, pedagogy drafting, runtime retrieval, evaluation, and student-visible excerpts. Sources marked as containing protected solutions are always denied runtime retrieval and student-visible excerpts.
- Every synthesized claim carries source evidence; source/provider secrets and raw uploaded content are not exposed through client responses or logs.
- Tutor versions and evaluation artifacts are immutable or append-only once persisted. Evaluation reports show deterministic and judge evidence without provider prompts or raw source content.
