-- TutorLab has one runtime answer boundary: protected and final answers are never revealed.
-- Remove brief settings that previously collapsed into that fixed boundary or had no
-- independent representation in the compiled tutor specification.
UPDATE "Project"
SET "teachingBrief" =
  CASE
    WHEN jsonb_typeof("teachingBrief" -> 'completedSteps') = 'array' THEN
      jsonb_set(
        (
          "teachingBrief" - 'assistanceBoundaries'
        ) ||
        CASE
          WHEN jsonb_typeof("teachingBrief" -> 'style') = 'object' THEN
            jsonb_build_object(
              'style',
              ("teachingBrief" -> 'style') - 'questioningPreference' - 'learnerSupports'
            )
          ELSE '{}'::jsonb
        END,
        '{completedSteps}',
        COALESCE(
          (
            SELECT jsonb_agg(step)
            FROM jsonb_array_elements("teachingBrief" -> 'completedSteps') AS step
            WHERE step <> '"assistance"'::jsonb
          ),
          '[]'::jsonb
        )
      )
    ELSE
      (
        "teachingBrief" - 'assistanceBoundaries'
      ) ||
      CASE
        WHEN jsonb_typeof("teachingBrief" -> 'style') = 'object' THEN
          jsonb_build_object(
            'style',
            ("teachingBrief" -> 'style') - 'questioningPreference' - 'learnerSupports'
          )
        ELSE '{}'::jsonb
      END
  END;
