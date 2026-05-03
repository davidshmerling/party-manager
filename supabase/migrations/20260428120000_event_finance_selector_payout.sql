-- העברות מסלקטור לשותף (לא משנות סה״כ מאזן אירוע — העברה פנימית)
-- =============================================================================
ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_line_kind_check;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_line_kind_check
  CHECK (line_kind IN ('income', 'expense', 'selector_payout'));

ALTER TABLE public.event_finance_lines
  ADD COLUMN IF NOT EXISTS transfer_from_admin_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT;

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_selector_payout_from_chk;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_selector_payout_from_chk
  CHECK (
    line_kind <> 'selector_payout'
    OR transfer_from_admin_id IS NOT NULL
  );

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_selector_payout_kind_null_chk;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_selector_payout_kind_null_chk
  CHECK (
    line_kind <> 'selector_payout'
    OR income_recipient_kind IS NULL
  );

COMMENT ON COLUMN public.event_finance_lines.transfer_from_admin_id IS
  'selector_payout: פרופיל הסלקטור שממנו יצא הכסף; recipient_admin_id = שותף מקבל';

NOTIFY pgrst, 'reload schema';
