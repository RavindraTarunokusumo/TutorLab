# Day 3–4 Tutor Design and Evaluation Milestone

**Status:** Approved design direction; pending written-spec review

**Scope:** SPEC Milestone Day 3 and Day 4

## Goal

Turn an approved compact `CourseModel` into a teacher-selected, compiled, course-grounded tutor, then evaluate it with six persisted learner scenarios. The product must work with live OpenAI-backed adapters while offering deterministic fixture adapters for tests and the demo path.

## Non-goals

- Repair, publishing, public tutor pages, and export remain Day 5 work.
- Raw source content, full protected solutions, internal prompts, API keys, and evaluator instructions never enter student-facing responses.
- The course model is consumed as an immutable versioned input; this milestone does not expand it or re-run source ingestion.
- Tutor traces remain out of scope.

## Architecture

The pipeline is deliberately split into resumable, versioned stages:

```text
CourseModelVersion -> designs -> selected TutorDesign -> TutorVersion/TutorSpec
                                                   -> preview conversation
TutorVersion/TutorSpec -> six EvalScenario records -> EvalRun -> EvalResult records
```

Each AI boundary has a server-only adapter and a deterministic fixture implementation. Route handlers authorize the project edit session, parse shared Zod contracts, start idempotent project jobs, and persist stage artifacts. The UI polls job/run state rather than inventing progress with timers.

## Data model

### Tutor design catalog and generated candidates

`TutorDesign` is a schema-validated candidate, not an arbitrary model proposal. A finite catalog provides stable `archetypeId` and `templateVersion` values, policy defaults, permitted assistance transitions, and evaluation expectations. The architect returns exactly three unique candidates with roles `best_fit`, `strong_alternative`, and `balanced_option`, plus excluded catalog options and reasons.

A candidate contains its evidence references, strategy summary, trade-off, a response to the fixed comparison learner message, and six teacher-editable behavior controls:

1. diagnose before explain;
2. hint escalation pace;
3. answer policy;
4. response tone;
5. response-length limit;
6. off-topic handling.

Teacher changes are local selection/override input for compilation; they do not mutate the generated candidate artifact.

### Compiled tutor versions

Add a `TutorVersion` relation under `Project` with a monotonic project-local version, its source `CourseModelVersion` ID, selected-design identity, validated `TutorSpec`, exact compiled instruction, status, and timestamps. `TutorSpec` has schema version `0.1` and separates learning contract, pedagogy, response style, boundaries, hard constraints, compact course manifest, runtime retrieval configuration, and evaluation state.

The compiler accepts only `PolicyDraftingInput`: teaching brief, selected CourseModel fields, selected design, and teacher-confirmed observations. It excludes raw source text, raw document analyses, unconfirmed pedagogy proposals, and protected solution content. A compiled version is append-only.

### Conversations

Add `Conversation` and `Message` records owned by a tutor version. Conversation state is one of the explicit assistance states, and message metadata contains only teaching move, current/next state, cited source IDs/titles, triggered boundary flag, and usage. The preview route always uses a teacher-authenticated conversation.

### Evaluation artifacts

Add `EvalScenario`, `EvalRun`, and `EvalResult` records. Scenarios are immutable, belong to a tutor version, and have exactly one of the six required types. Runs reference one tutor version and selected scenario IDs. Each result stores a complete transcript, deterministic-check outcome, judge result, safe usage metadata, lifecycle status, and error-safe diagnostics. A failure of one scenario becomes `not_run`/failed result and never cancels sibling scenarios.

`PipelineJob` gains design, compile, scenario, and evaluation stages while retaining project-scoped idempotency and safe progress diagnostics.

## Interfaces

### Tutor Architect

`TutorArchitect.generate({ courseModel, teachingBrief, generatedAt }): Promise<TutorDesignSet>` produces exactly three catalog-backed, evidence-backed candidates and exclusions. It rejects duplicate archetypes, unknown template versions, candidate roles that are not a complete set, unsupported strategy combinations, and evidence absent from the course manifest.

### Policy Compiler

`PolicyCompiler.compile({ input, version, compiledAt }): Promise<CompiledTutor>` returns `{ spec, compiledPrompt }`. It compiles hard constraints separately from soft preferences. Hard constraints always include protected-solution disclosure protection, untrusted-source instruction resistance, evidence/uncertainty behavior, and the selected answer policy.

### Assistance state machine

`validateTransition({ currentState, proposedState, spec, context }): StateTransition` is deterministic server logic. It accepts only the SPEC transition graph and applies the strictest permitted fallback state when the model proposal is invalid or conflicts with answer/disclosure policy. Every fallback is recorded in response metadata.

### Tutor runtime

`TutorRuntime.reply({ tutorVersion, conversation, learnerMessage, sources }): Promise<TutorReply>` assembles platform rules, compiled hard constraints, scope, state, soft preferences, permitted retrieved passages, history, and learner message in that order. It returns content and metadata, never instructions. Only documents permitted for runtime retrieval can be searched; protected-solution sources are excluded regardless of stored permission values.

The server streams the reply to preview clients using a structured event envelope: text deltas followed by one final metadata event. Fixture mode emits the same envelope deterministically.

### Scenario generation and evaluation

`ScenarioGenerator.generate({ courseModel, tutorSpec }): Promise<EvalScenario[]>` returns exactly six validated scenarios:

- confident misconception;
- correct result with invalid reasoning;
- stuck after two hints;
- persistent final-answer extraction;
- off-topic request;
- unsupported-course request.

The answer-extraction scenario carries a fixed adversarial learner sequence. Other scenarios may use a Student Simulator, but have fixed maximum-turn limits (one tutor reply for single-turn cases; at most three learner and three tutor turns otherwise).

`EvalRunner.run({ tutorVersion, scenarioIds, runId }): Promise<EvalRun>` independently executes scenarios with concurrency three. It calls the same tutor runtime, runs deterministic checks first, and calls the Pedagogy Judge only after those checks. Deterministic failures are authoritative and cannot be changed to pass by the judge.

`PedagogyJudge.judge({ scenario, transcript, evidence }): Promise<JudgeResult>` must cite exact transcript turn IDs for every failure/warning and may only return a recommended patch under the pre-existing Day 5 repair allowlist. It does not apply repairs.

## Runtime and safety rules

- Source retrieval filters require `useForRuntimeRetrieval`; protected solutions are always denied and student-visible excerpts require `revealExcerptsToStudents`.
- Uploaded materials are untrusted content and cannot override platform or compiled policy.
- If no permitted evidence supports a course claim, the tutor states that limit and redirects appropriately.
- Assistant replies enforce configured response maximum words with a bounded tolerance; they expose citations by source title/ID only.
- The runtime never returns provider IDs, OpenAI errors, prompts, judge instructions, raw analyses, or raw protected solution content.
- The runtime requires the tutor version's course-model version to remain available and project-owned.

## Deterministic evaluation checks

Before judgment, each result checks relevant requirements: citations for factual course claims, absence of protected final-answer strings, response-word limit, allowed teaching move, valid state transition, `REDIRECT` on off-topic input, and clear uncertainty on unsupported-source input. Results retain every check with evidence turn IDs. Any answer-leakage, factual, source-grounding, invalid-transition, or hard-policy failure yields `needs_revision` for the run.

Run readiness is:

- `ready`: all six results pass;
- `ready_with_warnings`: no deterministic failures and no more than two judge warnings;
- `needs_revision`: any hard or deterministic failure, incomplete run, or more than two warnings.

## User experience

### Designs

The design page shows a shared learner prompt and three equal comparison cards. Each card displays recommendation role, behavior summary, evidence, trade-off, and sample response. Selecting a card exposes six controls and a compile action. The selected candidate is clearly retained after refresh.

### Build

The build page presents durable stages for design generation, compilation, scenario generation, and evaluation. It reports server-backed progress and recoverable errors, announces updates accessibly, and permits cancellation only between calls. The report stage receives the persisted results; Day 5 will add repair controls and the full report experience.

### Preview

The preview page provides chat, reset, preset learner prompts, and an inspector with active move/state, source citations, boundary status, and suggested next state. A student-view toggle hides all inspector metadata while retaining the same tutor output.

## Error handling and idempotency

Every mutation accepts an idempotency key. A repeated completed/running request returns its existing job/run instead of repeating provider work. Invalid structured model output receives one adapter-level repair retry, then fails with an action-safe diagnostic. A failed individual scenario is persisted and can later be rerun without rebuilding unrelated results. No client response exposes provider payloads or raw diagnostics.

## Testing and success criteria

Unit coverage proves contracts reject invalid designs/specs/scenarios, catalog roles/archetypes remain unique, state transitions and fallbacks are safe, retrieval permissions exclude protected material, and deterministic checks identify seeded leaks/invalid responses.

Integration coverage proves authenticated stage routes persist and resume artifacts, compilation produces immutable tutor versions, preview chat returns state/citation metadata using fixture retrieval, and an evaluation run continues through a failing scenario with six persisted result records.

The browser golden path extends the fixture flow: create/prepare project, select Socratic design, compile, run all six scenarios, inspect the seeded answer-extraction failure, open preview, send a message, and verify the inspector.

The milestone is complete when a teacher can select one of three non-duplicate designs, compile a versioned grounded tutor, conduct a preview conversation with visible state and sources, and refresh-safe-run six persisted evaluation scenarios with inspectable deterministic/judge evidence.

## Constraints and decisions

- The MVP retains exactly three designs and exactly six scenario types; no user-authored scenarios or extra archetypes are introduced.
- Fixture and live paths share schemas and route contracts; tests never call the live provider.
- Evaluation uses limited concurrency of three; progress is persisted after each scenario.
- Day 5 repair/publish/export contracts are not implemented early, but judge patch output uses their approved path allowlist to preserve the next milestone boundary.
