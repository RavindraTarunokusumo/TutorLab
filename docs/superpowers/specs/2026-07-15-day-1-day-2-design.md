# TutorLab Day 1–2 Design Specification

**Status:** Approved design  
**Date:** 2026-07-15  
**Scope:** SPEC Milestone Day 1 and Day 2

## 1. Outcome

Deliver a navigable, persisted TutorLab application through the course-model review stage. A teacher can create a project, complete and resume a teaching brief, upload and index course evidence, run parallel per-document analysis, synthesize a compact source-grounded course model, correct the result, and save a teacher-edited version. All seven product stages render; stages beyond Day 2 use deterministic fixtures.

## 2. Requirements

### 2.1 Foundation

- Use a single Next.js 15 App Router application with TypeScript, Tailwind CSS, shadcn/ui, Prisma, PostgreSQL, Zod, Vitest, and Playwright.
- Provide Docker Compose PostgreSQL for local development.
- Validate server environment variables at startup boundaries without exposing secret values to the client.
- Keep OpenAI access behind server-only modules using the official JavaScript SDK and Responses API.
- Provide lint, formatting, typecheck, unit/integration test, browser test, build, Prisma, and database scripts.

### 2.2 Project access and navigation

- Create a named project without user authentication.
- Issue an unguessable signed edit token in an HTTP-only, SameSite cookie and persist only verification material.
- Require project edit authorization for all project mutations.
- Persist the current and last completed stage so refreshes resume correctly.
- Render the persistent stages `Brief → Sources → Course Model → Design → Build → Report → Preview`.
- Render deterministic fixture content for stages outside Day 1–2 scope.

### 2.3 Teaching brief

- Implement five educator-facing steps: context, purpose, objectives, assistance boundaries, and style/adaptation.
- Present one principal question per panel with back/next navigation and an under-five-minute completion estimate.
- Validate partial answers with shared Zod schemas.
- Autosave after a short debounce, report saving/saved/error state, and retain a browser draft when the server is temporarily unavailable.
- Persist completed steps and allow safe resume after refresh.

### 2.4 Course evidence

- Accept up to 30 PDF, DOCX, TXT, MD, or JSON files.
- Enforce configurable ingestion budgets with default hard caps of 500 pages, 2 million extracted tokens, 50 MB per file, and 200 MB per course workspace. Warn as usage approaches the intended 1-million-token, 25-MB-file, and 100-MB-workspace operating range.
- Use the three project-owner-supplied probability documents for test and initial live verification: practice exercises, sample exam, and marking scheme.
- Do not download or substitute third-party course materials from the internet.
- Require a declared role: syllabus, lecture/source content, exercise, assessment, rubric, solution, teacher note, or other.
- Defer tutor traces.
- Record source authority, permissions, protected-solution status, and content hash.
- Allow separate permissions for course modeling, pedagogy drafting, runtime retrieval, evaluation, and student-visible excerpts.
- Reject unsupported, oversized, duplicate, malformed, or password-protected files with actionable messages.
- Show upload, extraction, and analysis progress independently, including Uploading, Reading, Analyzing, Ready, and Failed.
- Upload accepted files server-side to OpenAI Files, attach them to one project-specific vector store, and poll indexing status.
- Store provider identifiers server-side only and allow removal before analysis.

### 2.5 Material analysis

- Start analysis through an idempotent project endpoint and return a persisted job identifier.
- Analyze each changed document independently with GPT-5.6 Structured Outputs and concurrency limited to three.
- Persist one `DocumentAnalysis` per document/content-hash/schema-version combination.
- Reuse cached analyses, retry failed documents independently, and support incremental updates.
- Synthesize a compact `CourseModel` from valid document analyses. Use category-level reduction when the full structured findings exceed synthesis context limits.
- Validate document analyses and the synthesized course model with the canonical Zod schemas used by application code and tests.
- Attempt one structured-output repair after validation failure; otherwise retain safe diagnostics and expose a retryable failure.
- Produce compact consolidated structure, objectives, concepts, terminology, methods, exercises, assessments, rubric criteria, protected solutions, misconceptions, content boundaries, pedagogical evidence, conflicts, warnings, and coverage.
- Support multiple evidence references per synthesized claim.
- Tag unsupported statements as `teacher_supplied` or `model_inferred`.
- Warn rather than block when solutions or rubrics are missing.
- Allow partial synthesis when documents fail and report completeness explicitly.
- Keep raw chunks, full document text, per-slide summaries, and complete worked solutions outside the course model.

### 2.6 Course-model review

- Present concepts, objectives, misconceptions, pedagogical observations, coverage, and warnings in a navigable left pane.
- Present selected-item fields and source evidence in the main pane; open source details in a filename-and-passage drawer.
- Allow edits to concepts, objectives, misconceptions, disclosure labels, and pedagogical-observation status.
- Visibly mark teacher-edited fields.
- Save corrections as a new immutable `CourseModelVersion` with `teacherEdited=true`.
- Require explicit confirmation before regeneration discards teacher edits.

### 2.7 Accessibility and visual behavior

- Follow the SPEC visual direction: light neutral canvas, indigo/violet accents, structured cards, strong hierarchy, generous spacing, and professional creative-tool tone.
- Meet WCAG AA contrast, keyboard navigation, visible focus, reduced-motion behavior, status text plus icons, and polite live-region announcements.
- Keep responsive behavior functional from mobile layouts through desktop review panes.

## 3. Data model

### `Project`

Identity, name, slug, edit-token verification material, status, current stage, last completed stage, teaching-brief JSON, vector-store ID, timestamps.

### `SourceDocument`

Project relationship, original name, role, authority, permission flags, protected-solution flag, content hash, MIME type, size, OpenAI file ID, separate upload/extraction/analysis status, page count, safe failure metadata, and timestamps.

Roles are `syllabus`, `lecture`, `exercise`, `assessment`, `rubric`, `solution`, `teacher_note`, or `other`. Authority is `teacher_instruction`, `course_authoritative`, `supplementary`, or `observational`. Permissions independently control course-model use, pedagogy drafting, runtime retrieval, evaluation, and student-visible excerpts.

### `DocumentAnalysis`

Project and source-document relationships, document hash, schema version, inferred classification, coverage, structured findings, compact summary, status, and analyzed timestamp. Structured findings contain evidence-backed topics, objectives, terminology, accepted methods, exercises, assessment criteria, protected solutions, misconceptions, and pedagogical patterns. Raw chunks remain in the retrieval index.

### `CourseModelVersion`

Project relationship, monotonic version, schema version `0.2`, compact course-model JSON, teacher-edited flag, provenance metadata, timestamps. Versions are immutable and reference document-analysis evidence rather than duplicating raw findings.

### `PipelineJob`

Project relationship, optional source-document relationship, stage, idempotency key, provider response ID, status, attempt count, safe diagnostic metadata, usage/latency metadata, start/completion timestamps. The project-stage/document/idempotency tuple is unique.

JSON artifacts carry their own `schemaVersion`; relational columns own identity, lifecycle, authorization, and queryable status.

## 4. Canonical interfaces

### Application schemas

- `TeachingBriefSchema` and partial step schemas.
- `SourceDocumentSchema`, role, authority, permissions, workspace-budget, and processing-status schemas.
- `EvidenceRefSchema` and evidence-backed item schemas.
- `DocumentAnalysisSchema` (`schemaVersion: "0.1"`).
- `CourseModelSchema` (`schemaVersion: "0.2"`) with stable item IDs, compact synthesis, coverage, multi-source provenance, pedagogical evidence, warnings, and disclosure labels.
- `CourseModelPatchSchema` limited to teacher-editable fields.
- `PipelineJobSchema` for polling responses.

The top-level contracts are:

```ts
type EvidenceRef = {
  documentId: string;
  documentAnalysisId?: string;
  excerptId: string;
  page?: number;
  section?: string;
  locatorLabel: string;
};

type SourceDocument = {
  id: string;
  projectId: string;
  name: string;
  role:
    | "syllabus"
    | "lecture"
    | "exercise"
    | "assessment"
    | "rubric"
    | "solution"
    | "teacher_note"
    | "other";
  authority:
    | "teacher_instruction"
    | "course_authoritative"
    | "supplementary"
    | "observational";
  permissions: {
    useForCourseModel: boolean;
    useForPedagogyDrafting: boolean;
    useForRuntimeRetrieval: boolean;
    useForEvaluation: boolean;
    revealExcerptsToStudents: boolean;
  };
  containsProtectedSolutions: boolean;
  contentHash: string;
  processing: {
    uploadStatus: ProcessingStatus;
    extractionStatus: ProcessingStatus;
    analysisStatus: ProcessingStatus;
    pageCount?: number;
    error?: string;
  };
};

type DocumentAnalysis = {
  schemaVersion: "0.1";
  documentId: string;
  documentHash: string;
  classification: {
    role:
      | "syllabus"
      | "lecture"
      | "exercise"
      | "assessment"
      | "rubric"
      | "solution"
      | "teacher_note"
      | "other";
    confidence: number;
  };
  coverage: {
    pageCount?: number;
    analyzedPages?: number;
    extractionWarnings: string[];
  };
  findings: {
    topics: EvidenceItem[];
    objectives: EvidenceItem[];
    terminology: EvidenceItem[];
    acceptedMethods: EvidenceItem[];
    exercises: EvidenceItem[];
    assessmentCriteria: EvidenceItem[];
    protectedSolutions: EvidenceItem[];
    misconceptions: EvidenceItem[];
    pedagogicalPatterns: EvidenceItem[];
  };
  summary: string;
  analyzedAt: string;
};

type PedagogicalObservation = {
  id: string;
  observation:
    | "method_marks_emphasized"
    | "reasoning_before_calculation"
    | "consistent_solution_sequence"
    | "conceptual_justification_required"
    | "formal_notation_required"
    | "common_misconception"
    | "worked_examples_frequently_used"
    | "assessment_answer_sensitive"
    | "other";
  description: string;
  suggestedPolicyEffects: Array<{
    policyPath: string;
    proposedValue: unknown;
    rationale: string;
  }>;
  evidence: EvidenceRef[];
  confidence: number;
  status: "proposed" | "teacher_confirmed" | "teacher_rejected";
};

type CourseModel = {
  schemaVersion: "0.2";
  projectId: string;
  version: number;
  coverage: {
    documentCount: number;
    analyzedCount: number;
    failedCount: number;
    totalPages?: number;
    analysisCompleteness: "complete" | "partial";
    missingMaterialTypes: string[];
  };
  courseIdentity: CourseIdentity;
  structure: {
    units: CourseUnit[];
    prerequisiteRelations: PrerequisiteRelation[];
  };
  learningObjectives: LearningObjective[];
  concepts: Concept[];
  terminology: Term[];
  methods: AcceptedMethod[];
  exercises: ExerciseSummary[];
  assessments: AssessmentSummary[];
  rubricCriteria: RubricCriterion[];
  protectedSolutions: ProtectedSolution[];
  misconceptions: Misconception[];
  contentBoundaries: ContentBoundary[];
  pedagogicalEvidence: PedagogicalObservation[];
  conflicts: CourseConflict[];
  warnings: CourseWarning[];
  sourceManifest: SourceReference[];
  teacherDecisions: TeacherDecision[];
  generatedAt: string;
};

type PolicyDraftingInput = {
  teachingBrief: TeachingBrief;
  courseSummary: Pick<
    CourseModel,
    | "courseIdentity"
    | "learningObjectives"
    | "structure"
    | "methods"
    | "rubricCriteria"
    | "misconceptions"
    | "contentBoundaries"
    | "pedagogicalEvidence"
    | "conflicts"
  >;
  selectedTutorDesign: TutorDesign;
  teacherConfirmedObservations: string[];
};
```

Referenced item types are focused Zod schemas with stable IDs and `EvidenceRef[]`; they do not embed raw chunks. `PolicyDraftingInput` is a future Day 3 boundary only. Day 1–2 does not implement the Tutor Architect or Policy Compiler.

### HTTP surface

- `POST /api/projects`: create project and edit session.
- `PATCH /api/projects/:id/brief`: validated partial autosave.
- `POST /api/projects/:id/files`: validate, upload, and begin indexing.
- `DELETE /api/projects/:id/files/:fileId`: remove before analysis.
- `POST /api/projects/:id/analyze`: analyze pending/changed documents and synthesize.
- `POST /api/projects/:id/files/:fileId/analyze`: retry or refresh one analysis.
- `POST /api/projects/:id/synthesize`: incrementally resynthesize from valid analyses.
- `GET /api/jobs/:jobId`: return persisted progress or result linkage.
- `GET /api/projects/:id/course-model`: return the latest authorized version.
- `PATCH /api/projects/:id/course-model`: validate corrections and create a version.
- Future-stage fixture handlers preserve the SPEC endpoint shapes without performing paid work.

## 5. Workflows

### Project and brief

Create project → set edit cookie → enter stage shell → answer a brief step → validate locally → debounce autosave → validate and persist server-side → update resume state.

### Upload and indexing

Select file, role, authority, and permissions → validate browser hints → enforce server and workspace budgets → hash content → create metadata → upload to OpenAI → create/reuse vector store → attach file → poll provider status → persist extraction state.

### Analysis

Select changed/unanalyzed sources → reuse matching cached analyses → analyze remaining documents with concurrency three → validate and persist each `DocumentAnalysis` → retain isolated failures → synthesize successful findings → validate compact `CourseModel` → create `CourseModelVersion` → complete job → advance with complete or partial coverage.

### Teacher correction

Load latest version → select structured item → inspect source evidence → edit allowed fields → validate patch → transactionally create the next version → mark edited provenance → refresh latest version.

## 6. Error handling and privacy

- Use stable error codes with educator-facing messages; do not expose stack traces or provider payloads.
- Retry transient network failures up to three times with exponential backoff and respect rate-limit hints up to 30 seconds.
- Treat indexing delays as pollable states, not immediate failures.
- Stop new uploads or analysis when a hard workspace budget is exceeded and identify the limiting budget.
- Permit partial synthesis when individual documents fail; retain retryable document-level errors and coverage warnings.
- Make duplicate mutation requests safe through idempotency.
- Never log uploaded contents, plaintext edit tokens, API keys, or full source passages.
- Treat uploaded text as untrusted evidence, never as system instructions.
- Apply source permissions to every later retrieval surface; protected solutions are never student-visible unless explicitly permitted.
- Reject unauthenticated or cross-project access with non-revealing responses.
- Keep raw source files only for the demo project lifecycle.

## 7. Verification

### Unit

- Environment, edit-token, upload, teaching-brief, course-model, patch, and job schemas.
- File, page, token, per-file-byte, workspace-byte, role, authority, permission, and source-reference rules.
- Document-analysis content-hash caching and compact course-model synthesis.
- Multi-source evidence and protected-solution retrieval filtering.
- Course-model version numbering and teacher-edit allowlist.

### Integration

- Project creation through persisted brief resume.
- Upload metadata, workspace budgets, and processing transitions with mocked OpenAI calls.
- Limited-concurrency document analysis, isolated retry, cache reuse, and incremental synthesis with mocked Responses Structured Output.
- Partial coverage, schema repair/failure behavior, and immutable teacher-correction versions.
- Authorization failure paths.

### Browser

- Create project, finish wizard, upload the three supplied fixture documents, load fixture analysis in explicit test mode, inspect evidence, edit a misconception/disclosure label, save, refresh, and confirm persistence.
- Verify keyboard navigation, focus behavior, upload announcements, responsive layouts, and all seven stage routes.

### Live

- Run the three-document curated probability pack against the live API and confirm valid source-grounded output, warnings behavior, persistence, and editable review. Live mode is the normal development default; fixture mode requires an explicit test/demo switch.
- Before final submission, exercise the ingestion and review flow with a realistic probability course workspace and verify the configured 30-file/500-page budget boundaries without requiring paid analysis of every maximum-size fixture.

## 8. Success criteria

- Docker-backed local setup reaches a healthy application and database.
- A project can be created and reopened through its edit session.
- Wizard data persists and resumes after refresh.
- Every stage route renders, with fixture data beyond Day 2.
- Three valid probability documents reach Ready in one project vector store during automated and initial live verification.
- One project enforces the 30-file, 500-page, 2-million-token, 50-MB-file, and 200-MB-workspace hard caps.
- Live analysis produces cacheable document analyses and a compact schema-valid course model with multi-source evidence.
- Failed documents can be retried independently and unchanged analyses are reused during resynthesis.
- Source authority and permissions prevent protected solutions from entering student-visible retrieval.
- Missing solution/rubric evidence creates warnings instead of blocking.
- Teacher corrections persist as a new course-model version.
- Lint, typecheck, full test suite, relevant browser tests, and production build pass.

## 9. Constraints and exclusions

- Do not implement Day 3+ live generation, compilation, tutoring, evaluation, publishing, or export behavior.
- Do not add accounts, production administration, LMS integration, persistent learner models, fine-tuning, or realtime voice.
- Do not introduce microservices, queues, a second file-storage pipeline, or compatibility shims.
- Keep provider calls mockable and all provider identifiers private.
- Use native implementation subagents for this task; do not use Grok.
