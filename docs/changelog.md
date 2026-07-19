# Changelog

## 2026-07-20

- The landing page now offers secure continue actions for browser-authorized projects, returning each teacher to its saved workflow stage.

Record notable behavior, architecture, API, persistence, or workflow changes.

## 2026-07-19 — Branded workspace and private API-key sessions

- Added the TutorLab logo, responsive stage summary, and viewport-fitted landing experience across desktop, tablet, and mobile layouts.
- Unified the Brief through Export workspace with branded navigation, content surfaces, controls, and progress states.
- When no deployment-level OpenAI key exists, project creation now requests a user key and holds it only in bounded server memory behind an opaque HTTP-only session identifier.
- OpenAI-backed routes use the user key only within the originating server request; the key is not written to browser storage, application logs, files, or the database.
- Review hardening prevents anonymous enrollment from evicting active sessions, validates and deduplicates keys before allocation, explicitly gates process-local sessions behind a trusted production edge, and uses a native focus-contained key dialog.

## 2026-07-17 — Original-document extraction metrics

- PDF page and token totals now come from PDF.js extraction of the original upload rather than vector-store retrieval chunks.
- DOCX token totals now come from the original document; page totals use saved document metadata when available and otherwise remain unknown.
- Document analysis uses the same canonical PDF/DOCX text as workspace budgeting.
- The normal homepage now always renders the real project launcher instead of leaving only a static hero.

## 2026-07-16 — Day 3–4 tutor build and evaluation

- Added teacher-selected, immutable tutor versions; grounded preview conversations; and persisted six-scenario evaluation runs.
- Added failure-first report cards with transcript evidence, deterministic checks, and judge findings. Repair recommendations remain inspectable only in this milestone.
- Extended the deterministic fixture journey through design, compilation, scenario generation, seeded answer-extraction failure inspection, and preview metadata.

## 2026-07-15 — Day 1–2 milestone verification

- Added a deterministic fixture golden path from project creation through immutable course-model correction.
- Documented the 30-document ingestion architecture, PostgreSQL lifecycle, protected-solution controls, and local verification commands.
- Live verification remains pending the owner-supplied probability PDFs; automated tests do not download or substitute course material.

## <YYYY-MM-DD> — <Change Title> - <Merge/Commit ID>

Summary:

- What changed:
- Why:
- User-visible impact:
- Migration notes:
- Related PR/commit:
