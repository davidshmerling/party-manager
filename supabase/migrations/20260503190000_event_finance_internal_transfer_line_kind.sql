-- שינוי סוג שורה: selector_payout → internal_transfer (העברות פנימיות בין משתמשים)
-- =============================================================================
ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_selector_payout_from_chk;

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_selector_payout_kind_null_chk;

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_line_kind_check;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_line_kind_check
  CHECK (line_kind IN ('income', 'expense', 'selector_payout', 'internal_transfer'));

UPDATE public.event_finance_lines
SET line_kind = 'internal_transfer'
WHERE line_kind = 'selector_payout';

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_line_kind_check;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_line_kind_check
  CHECK (line_kind IN ('income', 'expense', 'internal_transfer'));

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_internal_transfer_from_chk
  CHECK (
    line_kind <> 'internal_transfer'
    OR transfer_from_admin_id IS NOT NULL
  );

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_internal_transfer_income_kind_chk
  CHECK (
    line_kind <> 'internal_transfer'
    OR income_recipient_kind IS NULL
  );

COMMENT ON COLUMN public.event_finance_lines.transfer_from_admin_id IS
  'internal_transfer: מעביר; recipient_admin_id = מקבל';

NOTIFY pgrst, 'reload schema';
