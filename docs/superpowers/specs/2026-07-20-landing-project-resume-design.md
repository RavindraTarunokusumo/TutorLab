# Landing project resume

## Goal

When a teacher returns to TutorLab while a project is in progress, the landing page must offer a direct way to continue that project at its persisted current stage.

## Scope

- Resolve every project authorized by an existing HTTP-only edit-session cookie.
- Show each project's name, current stage, and a continue action on the landing page.
- Continue to the route mapped from the persisted stage.
- Show no resume card when there is no valid authorized project.
- Preserve the project data and access model. The landing page must not enumerate projects or expose project data belonging to another browser session.

## Data and interfaces

- `ProjectRepository` gains a lookup by an edit-token hash.
- New projects receive a project-specific HTTP-only edit cookie as well as the legacy current-project cookie.
- A server-only resume helper reads every supported edit cookie, validates each token, and returns the matching minimal `ProjectSnapshot` records.
- `Home` becomes an async server component and passes that minimal snapshot to the landing launcher.
- `ProjectLauncher` renders the continue card and maps `ProjectStage` to the existing workspace route.

## Workflow

1. The teacher creates or resumes a project and the server stores a project-specific HTTP-only edit cookie.
2. If the teacher revisits `/`, the server validates the supported edit cookies and looks up only their matching projects.
3. The landing page presents each saved project and links to its current stage.
4. If no cookie is valid or matches a project, the normal new-project form remains unchanged.

## Constraints and edge cases

- The database stores only the hash, never the plaintext edit token.
- A forged or expired token must render no project information.
- A deleted project must render no project information.
- The saved stage is authoritative; this feature does not advance, repair, or regenerate a project.
- The legacy shared cookie remains a read fallback so existing projects continue to work during the transition.

## Success criteria

- Every project authorized in the current browser is visible on the landing page with its stage and resume link.
- The link points to the stage's current workspace route (for project `fd87c251-f620-4bc1-aba5-d58104f80724`, Preview).
- Unauthenticated landing pages do not disclose project names or IDs.
- Unit coverage verifies both authorized and unavailable-session behavior.
