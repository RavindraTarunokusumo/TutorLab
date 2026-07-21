# Tutor Style Sample Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic Tutor Style card samples with stable catalog-owned responses that visibly demonstrate all eight teaching archetypes against one learner situation.

**Architecture:** Extend `TutorCatalogTemplate` with a required `sampleResponse`, author one response per catalog entry, and copy that field into deterministic and fixture-generated design candidates. Keep the existing shared comparison learner message unchanged and enforce catalog completeness and distinctness in tests.

**Tech Stack:** TypeScript, Next.js, Zod-backed TutorLab schemas, Vitest

---

### Task 1: Define distinct catalog-owned samples

**Files:**
- Modify: `src/lib/tutor/catalog.ts`
- Test: `tests/unit/tutor-catalog-state-machine.test.ts`

- [x] **Step 1: Write the failing catalog test**

Add assertions that every template has a non-empty `sampleResponse`, all responses are unique, none contains the generic phrase `keep support grounded`, and each remains concise.

- [x] **Step 2: Run the catalog test to verify it fails**

Run: `npx vitest run tests/unit/tutor-catalog-state-machine.test.ts`

Expected: FAIL because `TutorCatalogTemplate` does not yet expose `sampleResponse`.

- [x] **Step 3: Add the required catalog field and copy**

Add `sampleResponse: string` to `TutorCatalogTemplate`, require it in `directTemplate`, and define these behavior-led responses:

```ts
"Walk me through the step where your reasoning led to that answer. What rule or assumption makes that step valid?"
"Show me your method and where you felt least certain. I’ll start with one small hint, then make it more explicit only if you’re still stuck."
"Let’s treat your answer as a hypothesis. Which condition or piece of evidence from the problem could confirm—or challenge—it?"
"Show me each step you used. We’ll compare it with the course method, identify the first mismatch, and then correct that step together."
"Before checking the answer, recall the rule you used and state when it applies. Then we’ll test whether your working meets those conditions."
"Compare your working with the course’s example sequence: set up, apply the method, then verify. You fill in the verification step—what check would catch an error?"
"What was your plan, which step are you least confident about, and how could you independently check it? Your answers will tell us where to review."
"First checkpoint: state the method you chose and justify why it fits. If that holds, we’ll check one key step before moving on."
```

- [x] **Step 4: Run the catalog test to verify it passes**

Run: `npx vitest run tests/unit/tutor-catalog-state-machine.test.ts`

Expected: PASS.

### Task 2: Use catalog samples everywhere designs are created

**Files:**
- Modify: `src/lib/tutor/architect.ts`
- Modify: `src/lib/fixture-runtime.ts`
- Test: `tests/integration/tutor-design-generation.test.ts`

- [x] **Step 1: Write the failing generation assertions**

Assert that every generated design's `sampleResponse` equals the selected catalog template's response and that a generated three-card set contains three distinct responses.

- [x] **Step 2: Run the generation test to verify it fails**

Run: `npx vitest run tests/integration/tutor-design-generation.test.ts`

Expected: FAIL because the deterministic architect still constructs the generic sentence.

- [x] **Step 3: Copy catalog responses into candidates**

In `generateTutorDesigns`, replace the interpolated generic sentence with `template.sampleResponse`. In `fixtureTutorDesignSet`, replace the shared fixed response with the same catalog field.

- [x] **Step 4: Run focused tests**

Run: `npx vitest run tests/unit/tutor-catalog-state-machine.test.ts tests/integration/tutor-design-generation.test.ts tests/unit/tutor-design-comparison.test.tsx`

Expected: PASS.

- [x] **Step 5: Run static validation**

Run: `npm run lint`

Expected: PASS with no ESLint errors.

Run: `npm run build`

Expected: successful production build.

Validation result: focused ESLint and `npx tsc --noEmit` passed. The build wrapper could not replace a locally loaded Prisma DLL (`EPERM`), and a direct `next build` remained silent until the bounded timeout.

- [x] **Step 6: Commit the implementation**

```powershell
git add -- src/lib/tutor/catalog.ts src/lib/tutor/architect.ts src/lib/fixture-runtime.ts tests/unit/tutor-catalog-state-machine.test.ts tests/integration/tutor-design-generation.test.ts docs/superpowers/plans/2026-07-22-tutor-style-sample-responses.md
git commit -m "feat: distinguish tutor style sample responses"
```
