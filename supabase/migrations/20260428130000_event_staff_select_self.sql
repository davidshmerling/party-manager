-- סורקים: קריאת שורות event_staff של עצמם (RLS הישן חסם SELECT לסורק — רשימה ריקה בדף הבית).
-- can_manage_event לא חל על סורק, ולכן embed מ־client ל-event_staff החזיר 0 שורות.
DROP POLICY IF EXISTS event_staff_select ON public.event_staff;

CREATE POLICY event_staff_select ON public.event_staff
  FOR SELECT TO authenticated
  USING (
    public.can_manage_event((SELECT auth.uid()), event_id)
    OR user_id = (SELECT auth.uid())
  );
