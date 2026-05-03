-- מסיבות/אירועים + קישור אורחים; ברירת מחדל למיגרציה קיימת

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_created_at ON public.events (created_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_admin_all ON public.events
  FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.events TO authenticated;

-- אירוע ברירת מחדל (id קבוע לעדכון שורות קיימות)
INSERT INTO public.events (id, name)
VALUES ('a0000000-0000-4000-8000-000000000001'::uuid, 'האירוע שלי');

ALTER TABLE public.guests
  ADD COLUMN event_id uuid REFERENCES public.events (id) ON DELETE CASCADE;

UPDATE public.guests
SET event_id = 'a0000000-0000-4000-8000-000000000001'::uuid
WHERE event_id IS NULL;

ALTER TABLE public.guests ALTER COLUMN event_id SET NOT NULL;

CREATE INDEX idx_guests_event_id ON public.guests (event_id);
CREATE INDEX idx_guests_event_status ON public.guests (event_id, status);
