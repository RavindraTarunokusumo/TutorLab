# Deterministic tutor-style recommendations and structured Brief fields

## Goal

Make TutorLab's tutor configuration coherent and reproducible. The Teaching Brief supplies structured teaching context, the Design page owns response length and behavior preferences, and TutorLab recommends exactly three compatible tutor styles without asking a model to invent or select them.

## Product principles

- A setting has one owner. Response length belongs to Design, while context, purpose, objectives, and tone belong to the Brief.
- Recommendations are deterministic. The same normalized Course Model, Brief, and behavior preferences produce the same ordered three styles.
- Recommendations never contradict an explicit teacher preference.
- Inherited choices are shown as read-only information, not as disabled-looking editable controls.
- Catalog boundaries are explicit. Subject and language have no free-text fallback; specialized topics retain one.

## Teaching Brief

### Structured context

Replace free-text context fields with four labeled controls:

1. **Subject** — a closed dropdown based on broad academic disciplines. It contains Mathematics; Natural Sciences; Computer Science; Languages and Linguistics; Literature; Social Sciences; Humanities; Business and Economics; Health and Medicine; Engineering and Technology; Law; Arts and Design; Education; and Interdisciplinary Studies. It has no `Other` option.
2. **Main topic** — a subject-dependent dropdown. It is disabled until Subject is selected and then exposes a curated topic list for that subject. Every subject-specific list ends with `Other topic`, which reveals a required free-text topic field. Changing Subject clears an incompatible topic.
3. **Student level** — a closed dropdown containing Early childhood; Primary/elementary; Lower secondary; Upper secondary; Vocational/technical; Undergraduate; Postgraduate; Professional/continuing education; and Adult/self-directed learning.
4. **Teaching language** — a searchable, keyboard-operable combobox containing the complete ISO 639-1 catalog, sorted by localized display name. It has no `Other` option. Persist the stable ISO code and derive the display label from the catalog.

The language catalog is a standards-defined product boundary, not a claim that OpenAI publishes an exhaustive supported-language allowlist. OpenAI's GPT-4o and GPT-4.5 system cards demonstrate multilingual evaluation and also caution that performance varies by language.

### Other Brief fields

Purpose, learning objectives, and tone remain Brief-owned inputs. Remove the concise/balanced/detailed response-length choice and its persisted schema value. Existing stored Briefs may contain that legacy value; readers discard it safely rather than failing validation.

## Design workflow

The Design page follows this order:

1. Show a compact **Teaching Brief** summary with Subject, Main topic, Student level, Teaching language, Purpose, Objectives, and Tone. Render this as semantic read-only text with an `Edit Brief` link, not disabled inputs.
2. Let the teacher set the behavior preferences that affect style eligibility: diagnose before explaining, hint progression, off-topic handling, and the exact 50–500-word response-length slider.
3. Generate or update the three recommendations.
4. Let the teacher compare and select one recommended style.

Changing a recommendation-relevant preference marks the current recommendations stale and exposes an `Update recommendations` action. It does not silently replace a teacher's current choice.

## Tutor-style catalog

Expand the static catalog to eight pedagogical archetypes:

1. **Socratic Concept Tutor** — elicits reasoning and diagnoses understanding before explaining.
2. **Hint-Ladder Problem Coach** — advances through increasingly explicit hints while withholding the final step when policy requires it.
3. **Inquiry and Case-Based Guide** — uses questions, cases, and evidence to help learners construct explanations.
4. **Explicit Instruction Tutor** — gives concise modeling, guided practice, and checks for understanding.
5. **Retrieval Practice Coach** — uses low-stakes recall and spaced revisiting to strengthen retention.
6. **Worked-Example Fading Coach** — begins with modeled examples and gradually removes support.
7. **Metacognitive Reflection Coach** — prompts learners to plan, monitor, explain, and evaluate their approach.
8. **Mastery Checkpoint Tutor** — uses short checks and corrective feedback before advancing.

Each catalog record is application-authored and versioned. It contains an immutable ID, label, description, compatible purposes and levels, required or incompatible behavior preferences, Course Model signals, default behavior controls, state-machine template, move template, and stable catalog rank. Generated text may personalize a chosen template later, but it does not define the catalog or choose the recommendations.

The catalog is grounded in established teaching approaches documented by the [Carnegie Mellon Eberly Center on retrieval practice](https://www.cmu.edu/teaching/resources/instructionalstrategies/activelearningstrategies/retrievalpractice/index.html), [Carnegie Mellon guidance on worked examples](https://www.cmu.edu/teaching/online/designteach/strategies/activelearning.html), and the Education Endowment Foundation's guidance on [metacognition and self-regulation](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/metacognition-and-self-regulation) and [scaffolding](https://educationendowmentfoundation.org.uk/education-evidence/inclusive-teaching/universal-approaches).

## Deterministic recommendation engine

Recommendation is a pure application function over normalized inputs:

- Brief: subject, topic, student level, language, purpose, objectives, and tone.
- Course Model: confirmed pedagogical observations, assessment patterns, worked-example prevalence, misconception signals, notation expectations, and teacher revisions.
- Design preferences: diagnose-before-explaining, hint progression, and related behavior constraints.
- Catalog version.

The engine performs these steps:

1. Canonicalize values and sort unordered observations so persistence order cannot affect the result.
2. Apply hard eligibility rules. For example, when diagnose-before-explaining is off, exclude Socratic Concept Tutor and every archetype that requires diagnosis before direct explanation.
3. Score eligible styles with versioned integer weights for purpose, level, Course Model signals, and behavior preferences.
4. Sort by descending score, then by immutable catalog rank as the stable tie-breaker.
5. Return exactly three style IDs with deterministic, template-based reasons derived from the highest-scoring matched signals.

Equivalent normalized inputs therefore produce the same ordered trio. Teacher revisions can deliberately change the result. If fewer than three styles remain after eligibility filtering, compatibility rules—not random fallback—supply broadly compatible styles that still honor every hard constraint.

The recommendation result stores the catalog/scoring version and an input fingerprint. That supports stale-result detection, reproducible tests, and future migrations when recommendation rules change.

## Tutor compilation and runtime behavior

The selected archetype supplies a compatible state-machine and move template. Brief context and Course Model facts specialize that template. Explicit teacher behavior preferences override archetype defaults where the catalog declares them configurable; incompatible archetypes never reach compilation.

The exact response-length slider is the only response-length input. Compilation validates 50–500 words and writes the chosen maximum into safeguards. Remove the old Brief ceiling and its concise/balanced/detailed mapping.

Runtime prompts and deterministic boundaries must consume the compiled controls rather than hard-code one behavior. In particular, hint cadence and diagnose-first behavior must reflect the compiled tutor, while protected assessed answers remain governed by the fixed assessment policy.

## Disclosure removal

Remove the `Disclosure` label and editable value from Course Model review, patch operations, synthesis schemas, and newly persisted Course Model artifacts. Existing artifacts containing `disclosureLabel` are accepted during migration and normalized without it. Protected-solution handling remains policy-driven and is not made configurable elsewhere.

## Accessibility and interaction

- Every field has a persistent visible label and adjacent error/help text.
- The language combobox supports typing, arrow keys, Enter, Escape, and screen-reader announcements; matching is accent-insensitive across display names and ISO codes.
- The locked Main topic control exposes native disabled semantics and the explanation `Choose a subject first`.
- Read-only Brief values use definition-list semantics and remain fully legible; they do not use reduced disabled-control opacity.
- Interactive targets are at least 44 pixels high with visible keyboard focus.
- Validation occurs on blur or attempted progression, and focus moves to the first invalid field.
- Layout remains single-column on small screens and avoids horizontal scrolling at 375 pixels.
- Existing TutorLab palette and typography remain authoritative; no unrelated visual redesign is introduced.

## Data migration and compatibility

- Add shared, typed catalog modules for subjects/topics, student levels, ISO 639-1 languages, and tutor archetypes.
- Store catalog identifiers rather than duplicated labels where practical.
- Migrate legacy free-text Subject, Main topic, Student level, and Language values by normalized alias matching. Values that cannot map automatically keep the project readable but require correction before the Brief can be recompiled.
- Strip the legacy Brief `responseLength` during reads and writes.
- Strip legacy `disclosureLabel` values and `update_disclosure_label` decisions during Course Model normalization.
- Invalidate or regenerate old model-selected design candidates because they lack the deterministic catalog version and fingerprint.

## Testing

- Catalog tests prove Subject and Language contain no `Other`, topic remains locked until Subject is selected, and every subject has at least one topic plus `Other topic`.
- Language tests validate ISO-code uniqueness, stable ordering, search behavior, and absence of free-text submission.
- Schema and migration tests cover valid new records and legacy Brief/Course Model records.
- Recommendation table tests cover each Course Model signal and preference, including the rule that disabling diagnosis excludes Socratic and similar styles.
- Permutation tests prove unordered observation/input order does not change recommendations.
- Snapshot/golden tests prove equivalent normalized models yield the same ordered three IDs and reasons.
- Component tests cover keyboard use, focus, labels, dependent disabled state, correction flows, stale recommendations, and the read-only Brief summary.
- Compiler and runtime tests prove the exact word limit and selected behavior controls reach the final tutor instructions.
- Existing end-to-end project creation, Course Model review, Design, Preview, and export paths remain green.

## Success criteria

- The Brief has structured Subject, dependent Main topic, Student level, and Teaching language controls.
- Subject and Language have no `Other` option; Language covers the full ISO 639-1 catalog.
- Response length exists only as the Design slider.
- Disclosure no longer appears or persists in current artifacts.
- The Design panel visibly summarizes every Brief choice that affects tutor behavior.
- Exactly three compatible recommendations are produced deterministically from the same normalized inputs.
- Teacher behavior choices cannot produce a recommendation that requires the opposite behavior.
- The compiled tutor and runtime honor the selected style, exact response limit, Course Model, Brief, and assessment policy.
