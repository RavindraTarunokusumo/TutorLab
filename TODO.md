# TODO.md

This file contains active or future work only.

Completed sessions must be moved to `docs/iterations/archive/`.

Rules:

- Every implementation task starts here.
- Each meaningful sub-item should become one commit.
- Mark completed sub-items with commit hash.
- Move completed sessions to archive after PR/merge.

## Backlog

### Landing page brand polish

- [x] Task 1 — Add the TutorLab logo and a branded, responsive stage summary to the landing page (`277fcd8`)
  - [x] Integrate the official transparent logo without layout shift (`277fcd8`)
  - [x] Present the full tutor-building journey in a right-side brand panel (`277fcd8`)
  - [x] Polish the project launcher and validate responsive, accessible behavior (`277fcd8`)
- [x] Task 2 — Fit the complete branded landing experience inside the viewport without page scrolling (`4920d18`)
  - [x] Compact the hero and stage summary responsively without losing the workflow overview (`4920d18`)
  - [x] Verify zero page overflow at desktop and mobile viewport sizes (`4920d18`)
- [x] Task 3 — Extend viewport fitting to short phones, landscape phones, tablets, and large displays (`3318517`)
  - [x] Add height-aware density rules for short portrait screens (`3318517`)
  - [x] Use a side-by-side composition for short landscape screens (`3318517`)
  - [x] Verify visible bounds across the expanded viewport matrix (`3318517`)
- [x] Task 4 — Apply the TutorLab design system across every project stage from Brief through Export (`ad3ec32`)
  - [x] Create a branded, accessible eight-stage workspace header and progress system (`ad3ec32`)
  - [x] Unify the responsive content canvas, cards, controls, and interaction states (`ad3ec32`)
  - [x] Validate Brief, Sources, Model, Design, Build, Report, Preview, and Export states (`ad3ec32`)
- [x] Task 5 — Center the "Ask for reasoning first" checkbox against its label copy (`cb3e643`)
- [x] Task 6 — Prompt for a private OpenAI API key when the server has no configured key (`632d6ec`)
  - [x] Keep user-supplied keys memory-only, session-scoped, and out of logs and persistence (`632d6ec`)
  - [x] Make project creation request a key only when neither server configuration nor a valid session key exists (`632d6ec`)
  - [x] Provide the request-scoped key to every server route that calls OpenAI (`632d6ec`)
  - [x] Cover the credential boundary and launcher flow with focused tests and production configuration docs (`632d6ec`)
- [x] Task 7 — Address PR #5 credential-session and dialog accessibility review findings (`cb15d39`, `43b892a`)
  - [x] Prevent anonymous enrollment from evicting or exhausting active key sessions and rate-limit new sessions (`cb15d39`, `43b892a`)
  - [x] Require an explicit single-instance production opt-in for process-local key sessions (`cb15d39`)
  - [x] Use a focus-contained modal and restore focus to the Create project action (`cb15d39`)

### Source ingestion metric correction

- [x] Task 1 — Derive PDF page and extracted-token metrics from the uploaded PDF rather than vector-store parsed-content boundaries (`8d176bc`)
  - [x] Add a regression test for a small PDF whose provider content contains inflated form-feed/repeated chunks (`8d176bc`)
  - [x] Extract DOCX text from the original upload and keep its page total explicitly unknown (`8d176bc`)
  - [x] Keep refresh/retry metric finalization deterministic and preserve non-PDF ingestion behavior (`8d176bc`)
  - [x] Validate lint, typecheck, and 234 tests; fixture E2E is blocked before upload by its pre-existing source-list loading wait, and build is blocked after compilation by the pre-existing chat route export (`8d176bc`)

- [x] Task 2 — Show the project launcher on the normal homepage (`19bdd18`)
  - [x] Preserve fixture-mode labels for deterministic E2E compatibility (`19bdd18`)
  - [x] Verify the homepage unit test, lint, and typecheck (`19bdd18`)

- [x] Task 3 — Accept successful teaching-brief responses that include server metadata (`8decb3e`)

- [x] Task 4 — Advance a completed teaching brief to Sources and navigate there (`9efe0c1`)

- [x] Task 5 — Load the PDF parser outside the Next server bundle for source uploads (`1987327`)

- [x] Task 6 — Poll in-progress source uploads until extraction metrics are finalized (`8441200`)

- [x] Task 7 — Derive PDF and DOCX metrics from upload bytes before provider indexing (`7cfd759`)

- [x] Task 8 — Prevent source polling from restarting on every status update (`86a0763`)

- [x] Task 9 — Normalize optional document-analysis fields for OpenAI strict schemas (`a212723`)

- [x] Task 10 — Recover stale analysis jobs and use a responsive structured-output model (`4a1b458`)

- [x] Task 11 — Separate source uploads from bulk analysis controls (`7632012`)

### Day 3–4 tutor design and evaluation milestone

- [x] Task 1 — Define tutor and evaluation contracts (`230695e`)
- [x] Task 2 — Persist tutor and evaluation artifacts (`669d33e`)
- [x] Task 3 — Add tutor catalog and state machine (`f6be484`)
- [x] Task 4 — Generate tutor designs (`8a02ffb`)
- [x] Task 5 — Add tutor design comparison (`937cf44`)
- [x] Task 6 — Compile tutor specifications (`5cd72fb`)
- [x] Task 7 — Add grounded tutor preview (`7c82ff3`)
- [x] Task 8 — Generate evaluation scenarios (`ccc7b17`)
- [x] Task 9 — Add deterministic evaluation checks (`61112f6`)
- [x] Task 10 — Run tutor evaluations (`9585e88`)
- [x] Task 11 — Verify the Day 3–4 milestone (`3c18568`)

## Future Backlog

### Evaluation report persistence

- [ ] Persist teacher recommendations with their evaluation run so they survive navigation and refresh.
- [ ] Advance the stage to Preview when leaving the evaluation report.

### Preview course-evidence recovery

- [ ] Supplement raw-file retrieval with matching, source-backed CourseModel evidence when an in-scope concept is missed by the vector search.

### Preview streaming and rendering

- [ ] Display learner messages optimistically, stream tutor replies, render Markdown/LaTeX, and constrain transcript height with scrolling.
- [ ] Replace the latest-reply inspector with normalized per-reply details and remove fallback diagnostics.

### Standalone tutor export

- [ ] Export the active tutor as a standalone chatbot ZIP from a final Export stage.
- [ ] Include a compact course context and rebuildable local retrieval data, excluding protected and teacher-only content.
