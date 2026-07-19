# TODO.md

This file contains active or future work only.

Completed sessions must be moved to `docs/iterations/archive/`.

Rules:

- Every implementation task starts here.
- Each meaningful sub-item should become one commit.
- Mark completed sub-items with commit hash.
- Move completed sessions to archive after PR/merge.

## Backlog

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
