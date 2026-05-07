-- Fix polluted expense rows mistakenly marked as paybox.
-- ------------------------------------------------------
-- This migration is intentionally conservative:
-- 1) Preview current impact.
-- 2) Allow explicit event scope, but can run globally when array is empty.
-- 3) Raise NOTICE with affected row count.

-- [Preview] Run manually before and after migration if needed:
-- SELECT
--   event_id,
--   count(*) AS polluted_rows
-- FROM public.event_finance_lines
-- WHERE line_kind = 'expense'
--   AND income_recipient_kind = 'paybox'
--   AND (person_name IS NULL OR person_name !~* '(paybox|פייבוקס)')
-- GROUP BY event_id
-- ORDER BY polluted_rows DESC;

DO $$
DECLARE
  -- Safety guard: fill this array before running in environments with real data.
  -- Example:
  -- target_event_ids uuid[] := ARRAY['00000000-0000-0000-0000-000000000000'::uuid];
  target_event_ids uuid[] := ARRAY[]::uuid[];
  affected_rows integer := 0;
BEGIN
  UPDATE public.event_finance_lines
  SET
    income_recipient_kind = 'partner',
    updated_at = now()
  WHERE (
      coalesce(array_length(target_event_ids, 1), 0) = 0
      OR event_id = ANY(target_event_ids)
    )
    AND line_kind = 'expense'
    AND income_recipient_kind = 'paybox'
    AND (person_name IS NULL OR person_name !~* '(paybox|פייבוקס)');

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'fix_expense_kind_pollution updated % row(s).', affected_rows;
END $$;
