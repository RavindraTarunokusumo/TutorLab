# Standalone Tutor Export

## Goal

Let a teacher leave Preview for an Export stage, inspect the contents of a deployable standalone tutor package, and download it as a ZIP.

## Export page

Preview gains a `Proceed to Export` action. The new final workspace stage shows a package summary, a downloadable ZIP, and one panel entry per generated file. Each entry has a concise hover description explaining its purpose.

## Package

The ZIP is a small Next.js application with a browser chat surface, a server-side chat route, the compiled tutor policy, compact course model, permitted source context, environment template, package scripts, and `README.md` setup instructions.

The exported source context is normalized text chunks derived only from runtime-permitted, student-visible, non-protected sources. Provider vector-store state and raw embeddings are not portable, so setup creates a local retrieval index from those chunks. Raw uploaded files, protected solutions, evaluator prompts, provider IDs, and secrets are excluded.

## Setup guide

`README.md` explains environment setup, dependency install, one-time retrieval preparation, local start, deployment notes, and the limits of course grounding. It is included in the ZIP and previewable on the Export page.

## Success criteria

- The exported package can be downloaded as a ZIP from the new final stage.
- Every package file is separately listed and explained in the UI.
- The included tutor specification and course context correspond to the active tutor version.
- Included learning material is limited to student-permitted, runtime-retrievable, non-protected context.
- The package contains clear Markdown setup instructions and no secrets or teacher-only artifacts.
