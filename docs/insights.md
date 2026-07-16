# Insights

Record reusable lessons from completed sessions.

## 2026-07-16 — PR Closeout

- What worked: Small commits with a focused independent review before each handoff made late cross-cutting defects straightforward to isolate and correct.
- What failed: Some full-suite runs intermittently timed out in unrelated test workers; isolated reruns confirmed the affected files, but serial validation should be preferred when timing flakiness appears.
- Useful commands: `git fetch origin`, `git pull --ff-only origin main`, `gh pr view <number> --json state,mergedAt,mergeCommit`, and `git diff --check` supported safe post-merge closeout.
- Scripts created: None.
- Workflow improvement: Keep CLI-version-compatible PR metadata commands documented; this installed GitHub CLI does not support `gh pr create --json`.
- Skill worth adding or updating: A lightweight post-merge archival checklist could standardize merge-ID tagging and TODO cleanup.

## <YYYY-MM-DD> — <Session Name>

- What worked:
- What failed:
- Useful commands:
- Scripts created:
- Workflow improvement:
- Skill worth adding or updating:


