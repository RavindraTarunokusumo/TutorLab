# Insights

Record reusable lessons from completed sessions.

## 2026-07-20 — PR Closeout

- What worked: Comparing the branch against `origin/main`, then validating the published PR state, kept the release path explicit and reversible.
- What failed: The full Vitest worker pool exited unexpectedly, and the single-worker retry exceeded the available execution window without reporting an assertion failure.
- Useful commands: `npx eslint . --ignore-pattern '.worktree/**'`, `npm run typecheck`, `git diff --check origin/main...HEAD`, and `gh pr view <number> --json state,mergedAt,mergeCommit` provided the final release evidence.
- Scripts created: None.
- Workflow improvement: Keep nested local worktrees excluded from repository-wide tooling and document a bounded fallback for slow full-suite runs.
- Skill worth adding or updating: The publish workflow should distinguish worker-process failures from assertion failures in its validation summary.

## 2026-07-19 — Reviewed PR Closeout

- What worked: Independent security and structural reviews, followed by focused re-reviews of each corrective commit, produced a clear approval trail before merge.
- What failed: The configured Grok model was unavailable, and `gh pr merge --delete-branch` merged remotely but failed local cleanup because `main` belonged to another worktree. A semicolon-chained formatting check also allowed a documentation commit to proceed after Prettier reported a warning.
- Useful commands: `grok models`, `gh pr view <number> --json state,mergedAt,mergeCommit`, `git ls-remote --heads origin <branch>`, and `git worktree list` distinguish reviewer availability, remote merge state, and cleanup state without guessing.
- Scripts created: None.
- Workflow improvement: Check reviewer model availability before delegation, inspect PR state after any merge-command error before retrying, and run formatting checks as a separate blocking command rather than chaining them before a commit.
- Skill worth adding or updating: The PR closeout workflow should document the case where GitHub completes a merge but local branch deletion fails because the base branch is checked out in another worktree.

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
