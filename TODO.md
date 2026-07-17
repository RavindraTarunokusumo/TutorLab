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

_No scheduled work._
