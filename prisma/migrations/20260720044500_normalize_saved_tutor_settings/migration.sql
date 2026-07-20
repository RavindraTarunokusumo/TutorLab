-- Normalize persisted artifacts after removing the configurable answer policy and
-- the obsolete terminal assistance state. This keeps existing projects readable.
UPDATE "TutorDesign"
SET "artifact" = jsonb_set(
  jsonb_set(
    "artifact",
    '{controls}',
    ("artifact" -> 'controls') - 'answerPolicy'
  ),
  '{permittedAssistanceStates}',
  COALESCE(
    (
      SELECT jsonb_agg(state_value)
      FROM jsonb_array_elements("artifact" -> 'permittedAssistanceStates') AS state(state_value)
      WHERE state_value <> '"complete"'::jsonb
    ),
    '[]'::jsonb
  )
);

UPDATE "TutorVersion"
SET
  "spec" = jsonb_set(
    jsonb_set(
      "spec",
      '{pedagogy}',
      ("spec" -> 'pedagogy') - 'answerPolicy'
    ),
    '{pedagogy,permittedAssistanceStates}',
    COALESCE(
      (
        SELECT jsonb_agg(state_value)
        FROM jsonb_array_elements("spec" #> '{pedagogy,permittedAssistanceStates}') AS state(state_value)
        WHERE state_value <> '"complete"'::jsonb
      ),
      '[]'::jsonb
    )
  ),
  "compiledPrompt" = replace(
    replace(
      regexp_replace(
        "compiledPrompt",
        ',"answerPolicy":"(never_reveal|reveal_after_sufficient_attempts|available_in_revision_mode)"',
        '',
        'g'
      ),
      '"complete",',
      ''
    ),
    ',"complete"',
    ''
  );

UPDATE "Conversation"
SET "currentState" = 'diagnose'
WHERE "currentState" = 'complete';

UPDATE "Message"
SET "metadata" = jsonb_set(
  jsonb_set(
    "metadata",
    '{currentState}',
    CASE
      WHEN "metadata" ->> 'currentState' = 'complete' THEN '"diagnose"'::jsonb
      ELSE "metadata" -> 'currentState'
    END
  ),
  '{nextState}',
  CASE
    WHEN "metadata" ->> 'nextState' = 'complete' THEN '"diagnose"'::jsonb
    ELSE "metadata" -> 'nextState'
  END
)
WHERE "metadata" IS NOT NULL
  AND (
    "metadata" ->> 'currentState' = 'complete'
    OR "metadata" ->> 'nextState' = 'complete'
  );

UPDATE "EvalRun"
SET "teacherRecommendations" = COALESCE(
  (
    SELECT jsonb_agg(recommendation)
    FROM jsonb_array_elements("teacherRecommendations") AS item(recommendation)
    WHERE recommendation ->> 'configurationArea' <> 'answer_sharing'
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof("teacherRecommendations") = 'array';

UPDATE "EvalResult"
SET "judgeResult" = "judgeResult" - 'proposedRepair'
WHERE "judgeResult" -> 'proposedRepair' ->> 'path' = '/pedagogy/answer_policy';
