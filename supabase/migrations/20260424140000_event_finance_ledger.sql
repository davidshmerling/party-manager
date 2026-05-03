-- הכנסות / הוצאות לאירוע (מסיבה) — אדמין בלבד; שורה: שם, פלאפון, סכום, לאיזה אדמין, האם שולם
-- =============================================================================
CREATE TABLE public.event_finance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  line_kind text NOT NULL CHECK (line_kind IN ('income', 'expense')),
  person_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  recipient_admin_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  is_paid boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_finance_lines_event ON public.event_finance_lines (event_id);
CREATE INDEX idx_event_finance_lines_event_kind ON public.event_finance_lines (event_id, line_kind);
CREATE INDEX idx_event_finance_lines_recipient ON public.event_finance_lines (event_id, recipient_admin_id, is_paid);

CREATE TRIGGER tr_event_finance_lines_updated
  BEFORE UPDATE ON public.event_finance_lines
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_guests_updated_at();

COMMENT ON TABLE public.event_finance_lines IS 'הכנסות/הוצאות לאירוע; recipient_admin = למי שולם/משויך (אדמין)';

ALTER TABLE public.event_finance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_finance_lines_admin_all
  ON public.event_finance_lines
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_finance_lines TO authenticated;
