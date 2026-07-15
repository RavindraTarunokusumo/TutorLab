# Database and Persistence

TutorLab uses PostgreSQL through Prisma. `prisma/schema.prisma` and its checked-in migrations are the source of truth.

## Core records

- `Project`: name, current stage, teaching brief, edit-token verifier, and one project-specific vector-store ID.
- `SourceDocument`: upload metadata, role, authority, permissions, protected-solution flag, content hash, processing state, measured extraction metrics, and private OpenAI file ID.
- `DocumentAnalysis`: a schema-versioned, content-hash-cached structured analysis for one source.
- `CourseModelVersion`: an immutable compact course-model artifact with a monotonic project-local version and teacher-edit marker.
- `PipelineJob`: persisted, idempotent analysis progress and safe diagnostics.

## Relationships and lifecycle

Every source, analysis, model version, and job belongs to one project. Composite project/source constraints prevent a source from being attached to a different project’s analysis or job. Deleting a project cascades to its owned artifacts; deleting a source is blocked while dependent analysis/job records remain.

`SourceDocument` processing fields are intentionally separate: upload, extraction/indexing, and analysis can progress or fail independently. Extraction cannot become ready until a trustworthy extracted-token metric has been recorded, so workspace budget enforcement remains authoritative.

## Operational rules

- Apply migrations with `npm run db:migrate`; do not manually edit an applied migration.
- Use a separate database for tests. Never point test commands at development or production data.
- Project-scoped source creation and final extraction metrics run in serializable transactions with a project lock, preventing concurrent uploads from bypassing workspace budgets.
- `CourseModelVersion` rows are append-only. Save teacher changes as a new version rather than updating the stored artifact.
