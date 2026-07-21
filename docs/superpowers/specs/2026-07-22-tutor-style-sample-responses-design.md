# Tutor Style Sample Responses

## Goal

Make the Tutor Style comparison cards demonstrate how each recommended tutor would respond differently. All candidates answer the same learner message so differences come from teaching behavior rather than different scenarios.

## Comparison scenario

Keep the existing shared learner message:

> I got the final answer, but I am not sure whether my reasoning is valid. Can you help me check it?

## Design

Add one concise, hand-written `sampleResponse` to every tutor catalog template. Each response must:

- speak directly as the tutor;
- demonstrate the archetype's distinctive first teaching move and support sequence;
- remain safe around final answers and protected solutions;
- avoid generic descriptions such as "I'll use ... strategies";
- stay independent of a particular subject so the same catalog entry remains deterministic across similar Course Models.

The catalog is the single source of truth. Deterministic recommendation generation and the fixture runtime both copy the selected template's sample response rather than constructing or generating new copy.

## Archetype distinctions

- **Socratic Concept Tutor:** asks the learner to justify the step where their conclusion follows.
- **Hint-Ladder Problem Coach:** asks for the attempted method, then offers to move from a small hint toward a partial worked step.
- **Inquiry and Case-Based Guide:** asks the learner to treat their result as a claim and test it against evidence or conditions.
- **Explicit Instruction Tutor:** checks the learner's work against a clear method or sequence before explaining a correction.
- **Retrieval Practice Coach:** prompts recall of the rule or principle used before checking its application.
- **Worked-Example Fading Coach:** compares the attempt with a modeled sequence while leaving a key step for the learner.
- **Metacognitive Reflection Coach:** asks the learner to explain their plan, confidence, and verification strategy.
- **Mastery Checkpoint Tutor:** uses a focused checkpoint to verify the method before allowing progression.

## Validation

Tests will verify that all catalog templates have non-empty, distinct sample responses, that generated candidates use their catalog response unchanged, and that fixture candidates follow the same source-of-truth behavior.

No card layout, recommendation ranking, learner message, tutor controls, or runtime policy changes are included.
