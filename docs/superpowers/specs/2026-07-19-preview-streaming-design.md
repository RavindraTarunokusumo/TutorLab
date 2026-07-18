# Preview streaming and fixed transcript panel

## Goal

Make the tutor preview feel like a live chat: the learner's message appears immediately, the tutor reply visibly streams afterward, and transcript growth never changes the page layout.

## Behavior

- On send or preset selection, append the learner message optimistically to the displayed transcript before requesting the reply.
- Add one pending tutor message. Append every SSE text delta to that message until the final envelope arrives.
- Render learner and tutor content as GitHub-flavored Markdown with inline and display LaTeX. During streaming, render the accumulated safe text on every delta; malformed in-progress notation remains readable as plain text until it is complete.
- On a failed request, remove the pending tutor message, retain the learner message, and show the existing error treatment so the question is not lost.
- Keep input and preset controls disabled while a response is in progress.
- Keep the transcript area at a viewport-relative fixed height. It scrolls internally and follows the newest message while the learner is at the bottom.

## Boundaries

- The server-side conversation, streaming protocol, citation metadata, and safety rules remain unchanged.
- The inspector continues to update only after the final response metadata arrives.
- Existing Markdown and KaTeX dependencies and styling are reused; no new renderer protocol is introduced.
- No persisted schema or API contract changes are required.

## Success criteria

- A submitted question is visible before the first tutor token.
- Tutor text grows incrementally as server-sent deltas arrive.
- Markdown lists, emphasis, code, and mathematical notation are readable in both streamed and completed messages.
- Long conversations remain inside a fixed-height, scrollable transcript panel.
- Existing reset, presets, metadata, and error behavior remain functional.

## Validation

- Add a component-level regression check for optimistic learner display and streamed tutor updates where practical.
- Run lint and the focused preview runtime tests.
