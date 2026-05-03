-- =============================================================================
-- QR Party: event_staff, הרחבת events, RBAC, RLS, סריקה אטומית ו-idempotent
-- =============================================================================

-- --- פרופילים: תפקיד גלובלי admin | scanner --------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'scanner'));

COMMENT ON COLUMN public.profiles.role IS 'admin = ניהול מערכת; scanner = סריקה/סטט לפי event_staff בלבד';

-- --- הרחבת events -----------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug_unique ON public.events (slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_set_updated_at ON public.events;
CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_events_updated_at();

-- מילוי created_by לאירועים קיימים (אדמין ראשון)
UPDATE public.events e
SET created_by = (SELECT p.id FROM public.profiles p WHERE p.role = 'admin' ORDER BY p.created_at ASC LIMIT 1)
WHERE e.created_by IS NULL;

-- --- event_staff ------------------------------------------------------------
CREATE TABLE public.event_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'scanner')),
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_staff_event_id ON public.event_staff (event_id);
CREATE INDEX idx_event_staff_user_id ON public.event_staff (user_id);

COMMENT ON TABLE public.event_staff IS 'שיוך משתמש לאירוע: admin או scanner ברמת האירוע';

ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;

-- --- פונקציות הרשאה (SECURITY DEFINER) ------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_event(uid uuid, eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(uid)
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = eid AND e.created_by = uid)
    OR EXISTS (
      SELECT 1 FROM public.event_staff es
      WHERE es.event_id = eid AND es.user_id = uid AND es.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_scan_event(uid uuid, eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_event(uid, eid)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      INNER JOIN public.event_staff es ON es.user_id = p.id AND es.event_id = eid
      WHERE p.id = uid AND p.role = 'scanner' AND es.role = 'scanner'
    );
$$;

-- --- RLS: events (הסרת מדיניות ישנה) ----------------------------------------
DROP POLICY IF EXISTS events_admin_all ON public.events;

CREATE POLICY events_select_visible ON public.events
  FOR SELECT TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_staff es
      WHERE es.event_id = events.id AND es.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY events_insert_global_admin ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY events_update_manage ON public.events
  FOR UPDATE TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), id))
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), id));

CREATE POLICY events_delete_global_or_creator ON public.events
  FOR DELETE TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR created_by = (SELECT auth.uid())
  );

-- --- RLS: guests (רק מנהלי אירוע — לא scanner ללא SELECT) ------------------
DROP POLICY IF EXISTS guests_admin_select ON public.guests;
DROP POLICY IF EXISTS guests_admin_insert ON public.guests;
DROP POLICY IF EXISTS guests_admin_update ON public.guests;
DROP POLICY IF EXISTS guests_admin_delete ON public.guests;

CREATE POLICY guests_manage_select ON public.guests
  FOR SELECT TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY guests_manage_insert ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY guests_manage_update ON public.guests
  FOR UPDATE TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id))
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY guests_manage_delete ON public.guests
  FOR DELETE TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

-- --- RLS: event_staff -------------------------------------------------------
CREATE POLICY event_staff_select ON public.event_staff
  FOR SELECT TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY event_staff_insert ON public.event_staff
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY event_staff_delete ON public.event_staff
  FOR DELETE TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

GRANT SELECT, INSERT, DELETE ON TABLE public.event_staff TO authenticated;

-- --- סריקה אטומית ו-idempotent ---------------------------------------------
CREATE OR REPLACE FUNCTION public.process_guest_scan(p_code text, p_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guests%ROWTYPE;
  cleaned text;
  now_ts timestamptz := now();
  caller uuid := auth.uid();
  ev_name text;
  updated_row public.guests%ROWTYPE;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF caller IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'result', 'forbidden',
      'message', 'נדרשת התחברות',
      'guest', null,
      'guest_name', null,
      'checked_in_at', null,
      'event_id', null,
      'event_name', null
    );
  END IF;

  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'result', 'forbidden',
      'message', 'חסר מזהה אירוע',
      'guest', null,
      'guest_name', null,
      'checked_in_at', null,
      'event_id', null,
      'event_name', null
    );
  END IF;

  IF NOT public.can_scan_event(caller, p_event_id) THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'result', 'forbidden',
      'message', 'אין הרשאת סריקה לאירוע זה',
      'guest', null,
      'guest_name', null,
      'checked_in_at', null,
      'event_id', p_event_id::text,
      'event_name', null
    );
  END IF;

  SELECT name INTO ev_name FROM public.events WHERE id = p_event_id LIMIT 1;

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'result', 'not_found',
      'message', 'קוד ריק',
      'guest', null,
      'guest_name', null,
      'checked_in_at', null,
      'event_id', p_event_id::text,
      'event_name', ev_name
    );
  END IF;

  IF position('/ticket/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/ticket/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  ELSIF position('/guest/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/guest/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  END IF;

  SELECT * INTO g FROM public.guests WHERE unique_code = cleaned FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'result', 'not_found',
      'message', 'לא נמצא כרטיס',
      'guest', null,
      'guest_name', null,
      'checked_in_at', null,
      'event_id', p_event_id::text,
      'event_name', ev_name
    );
  END IF;

  IF g.event_id IS DISTINCT FROM p_event_id THEN
    RETURN jsonb_build_object(
      'status', 'wrong_event',
      'result', 'wrong_event',
      'message', 'הכרטיס שייך לאירוע אחר',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
      'guest_name', g.name,
      'checked_in_at', g.entered_at,
      'event_id', p_event_id::text,
      'event_name', ev_name
    );
  END IF;

  IF g.status = 'entered' THEN
    RETURN jsonb_build_object(
      'status', 'already_checked_in',
      'result', 'already_entered',
      'message', 'כבר נכנס',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
      'guest_name', g.name,
      'checked_in_at', g.entered_at,
      'event_id', p_event_id::text,
      'event_name', ev_name
    );
  END IF;

  IF g.status = 'pending' THEN
    UPDATE public.guests
    SET status = 'entered', entered_at = now_ts, updated_at = now_ts
    WHERE id = g.id AND status = 'pending' AND event_id = p_event_id
    RETURNING * INTO updated_row;

    IF updated_row.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'ok',
        'result', 'ok',
        'message', 'נכנס',
        'guest', jsonb_build_object('name', updated_row.name, 'entered_at', updated_row.entered_at),
        'guest_name', updated_row.name,
        'checked_in_at', updated_row.entered_at,
        'event_id', p_event_id::text,
        'event_name', ev_name
      );
    END IF;

    SELECT * INTO g FROM public.guests WHERE id = g.id;
    IF g.status = 'entered' THEN
      RETURN jsonb_build_object(
        'status', 'already_checked_in',
        'result', 'already_entered',
        'message', 'כבר נכנס',
        'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
        'guest_name', g.name,
        'checked_in_at', g.entered_at,
        'event_id', p_event_id::text,
        'event_name', ev_name
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'not_found',
    'result', 'not_found',
    'message', 'לא ניתן לעדכן',
    'guest', null,
    'guest_name', null,
    'checked_in_at', null,
    'event_id', p_event_id::text,
    'event_name', ev_name
  );
END;
$$;

-- --- סטטיסטיקות לאירוע (ללא חשיפת רשימת אורחים ל-scanner) -------------------
CREATE OR REPLACE FUNCTION public.get_event_stats(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total int;
  entered int;
  pending int;
  last_in timestamptz;
  ev_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF uid IS NULL OR NOT public.can_scan_event(uid, p_event_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT e.name INTO ev_name FROM public.events e WHERE e.id = p_event_id LIMIT 1;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE g.status = 'entered')::int,
    count(*) FILTER (WHERE g.status = 'pending')::int,
    max(g.entered_at)
  INTO total, entered, pending, last_in
  FROM public.guests g
  WHERE g.event_id = p_event_id;

  RETURN jsonb_build_object(
    'event_id', p_event_id::text,
    'event_name', ev_name,
    'total_guests', total,
    'checked_in_count', entered,
    'not_checked_in_count', pending,
    'checked_in_percentage',
      CASE WHEN total > 0 THEN round((entered::numeric / total) * 100, 1) ELSE 0 END,
    'last_check_in_at', last_in
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_stats(uuid) TO authenticated;

-- --- ניהול צוות אירוע (RPC) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_event_staff(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', es.id,
        'user_id', es.user_id,
        'email', COALESCE(u.email::text, ''),
        'role', es.role,
        'created_at', es.created_at
      ) ORDER BY COALESCE(u.email::text, '')
    ), '[]'::jsonb)
    FROM public.event_staff es
    LEFT JOIN auth.users u ON u.id = es.user_id
    WHERE es.event_id = p_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_event_staff_member(
  p_event_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL OR p_role NOT IN ('admin', 'scanner') THEN
    RAISE EXCEPTION 'פרמטרים לא תקינים';
  END IF;

  IF p_role = 'scanner' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'scanner') THEN
    RAISE EXCEPTION 'יש לקדם את המשתמש ל-scanner לפני השיוך';
  END IF;

  IF p_role = 'admin' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'משתמש עם תפקיד admin בלבד יכול להיות אדמין אירוע';
  END IF;

  INSERT INTO public.event_staff (event_id, user_id, role, assigned_by)
  VALUES (p_event_id, p_user_id, p_role, uid)
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role, assigned_by = uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_event_staff_member(p_event_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.event_staff
  WHERE event_id = p_event_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_scanner(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;

  SELECT u.email::text INTO u_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'משתמש לא קיים';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (p_user_id, u_email, NULL, 'scanner')
  ON CONFLICT (id) DO UPDATE SET role = 'scanner', email = EXCLUDED.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_event_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_event_staff(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.add_event_staff_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_event_staff_member(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_event_staff_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_event_staff_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.promote_to_scanner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_scanner(uuid) TO authenticated;

-- --- עדכון promote_to_admin (מאפשר שדרג מ-scanner) ---------------------------
CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;

  SELECT u.email::text INTO u_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'משתמש לא קיים';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (p_user_id, u_email, NULL, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', email = EXCLUDED.email;
END;
$$;

-- --- get_all_users_for_admin + role ----------------------------------------
-- לא ניתן לשנות RETURNS TABLE ב־CREATE OR REPLACE — צריך DROP לפני הוספת עמודה
DROP FUNCTION IF EXISTS public.get_all_users_for_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean,
  profile_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(u.email::text, ''),
    COALESCE(p.display_name, ''),
    (p.role = 'admin'),
    COALESCE(p.role, '')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_users_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;

-- --- remove_admin: ספירת אדמינים לפי role = admin בלבד -----------------------
CREATE OR REPLACE FUNCTION public.remove_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO admin_count FROM public.profiles WHERE role = 'admin';
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'לא ניתן להסיר את האדמין האחרון';
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id AND role = 'admin';
END;
$$;
