-- דרגות: partner (שותף) — הכל + כספים; admin — ניהול ללא כספים/ניהול שותפים; scanner — לפי אירוע
-- =============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('partner', 'admin', 'scanner'));

COMMENT ON COLUMN public.profiles.role IS
  'partner=שותף (הכול+כספים+ניהול שותפים); admin=ניהול בלי כספים/ניהול שותפים; scanner=סריקה/סטט לפי event_staff';

-- כל האדמינים הקיימים (role=admin) הופכים ל־partners
UPDATE public.profiles SET role = 'partner' WHERE role = 'admin';

-- שותף + אדמין (רמה) = גישה לניהול אורחים/אירועים; רק is_partner = כספים + ניהול אדמינים
CREATE OR REPLACE FUNCTION public.is_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_uid AND p.role IN ('partner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_uid AND p.role = 'partner'
  );
$$;

-- --- כספים: רק שותף ---------------------------------------------------------
DROP POLICY IF EXISTS event_finance_lines_admin_all ON public.event_finance_lines;
CREATE POLICY event_finance_lines_partner_all
  ON public.event_finance_lines
  FOR ALL
  TO authenticated
  USING (public.is_partner((SELECT auth.uid())))
  WITH CHECK (public.is_partner((SELECT auth.uid())));

-- --- לוגים: רק שותף ----------------------------------------------------------
DROP POLICY IF EXISTS audit_log_select_admins ON public.audit_log;
CREATE POLICY audit_log_select_partners
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_partner((SELECT auth.uid())));

DROP POLICY IF EXISTS technical_log_select_admins ON public.technical_log;
CREATE POLICY technical_log_select_partners
  ON public.technical_log
  FOR SELECT
  TO authenticated
  USING (public.is_partner((SELECT auth.uid())));

DROP FUNCTION IF EXISTS public.list_audit_logs(int, int);
DROP FUNCTION IF EXISTS public.list_technical_logs(int, int);

DROP FUNCTION IF EXISTS public.list_audit_logs(int, int, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.list_technical_logs(int, int, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.list_audit_logs(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_min_created_at timestamptz DEFAULT NULL,
  p_max_created_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.audit_log a
  WHERE public.is_partner((SELECT auth.uid()))
    AND (p_min_created_at IS NULL OR a.created_at >= p_min_created_at)
    AND (p_max_created_at IS NULL OR a.created_at <= p_max_created_at)
  ORDER BY a.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.list_technical_logs(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_min_created_at timestamptz DEFAULT NULL,
  p_max_created_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.technical_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.technical_log t
  WHERE public.is_partner((SELECT auth.uid()))
    AND (p_min_created_at IS NULL OR t.created_at >= p_min_created_at)
    AND (p_max_created_at IS NULL OR t.created_at <= p_max_created_at)
  ORDER BY t.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_audit_logs(int, int, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(int, int, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.list_technical_logs(int, int, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_technical_logs(int, int, timestamptz, timestamptz) TO authenticated;

-- --- עריכת שם: רק שותף מנהל
CREATE OR REPLACE FUNCTION public.admin_set_user_display_name(
  p_user_id uuid,
  p_display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  clean text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;
  clean := NULLIF(BTRIM(COALESCE(p_display_name, '')), '');
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'משתמש לא קיים';
  END IF;
  UPDATE public.profiles
  SET display_name = clean
  WHERE id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'אין שורת פרופיל — קדמו המשתמש לסורק או אדמין, ואז ניתן לשמור שם תצוגה';
  END IF;
END;
$$;

-- --- רשימת משתמשים: רק שותף --------------------------------------------------
DROP FUNCTION IF EXISTS public.get_all_users_for_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean,
  is_partner boolean,
  profile_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(u.email::text, ''),
    COALESCE(p.display_name, ''),
    (p.role = 'admin'),
    (p.role = 'partner'),
    COALESCE(p.role, '')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_users_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;

-- promote / remove: רק שותף
CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
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

CREATE OR REPLACE FUNCTION public.promote_to_partner(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'scanner') THEN
    RAISE EXCEPTION 'הגדירו תפקיד שאינו סורק לפני קידום לשותף';
  END IF;
  SELECT u.email::text INTO u_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'משתמש לא קיים';
  END IF;
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (p_user_id, u_email, NULL, 'partner')
  ON CONFLICT (id) DO UPDATE SET role = 'partner', email = EXCLUDED.email;
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
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('partner', 'admin')) THEN
    RAISE EXCEPTION 'משתמש ניהול גלובלי (שותף/אדמין) לא יכול לעבור לסורק — יש להסיר או לשנות תפקיד.';
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

CREATE OR REPLACE FUNCTION public.remove_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_role text;
  partner_count int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;
  SELECT p.role::text INTO r_role FROM public.profiles p WHERE p.id = p_user_id;
  IF r_role IS NULL THEN
    RETURN;
  END IF;
  IF r_role = 'scanner' THEN
    RAISE EXCEPTION 'הסרת סורק — לא דרך כפתור זה';
  END IF;
  IF r_role = 'partner' THEN
    SELECT COUNT(*)::int INTO partner_count FROM public.profiles WHERE role = 'partner';
    IF partner_count <= 1 THEN
      RAISE EXCEPTION 'לא ניתן להסיר את השותף האחרון';
    END IF;
  END IF;
  DELETE FROM public.profiles WHERE id = p_user_id AND role IN ('partner', 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_partner(uuid) TO authenticated;

-- רשימת כל המשתמשים לשימושי staff (שותף+אדמין): שיוך סורק, נמען תשלום, וכו' — לא דרך דף ניהול שותפים
DROP FUNCTION IF EXISTS public.list_global_users_for_staff();

CREATE OR REPLACE FUNCTION public.list_global_users_for_staff()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean,
  is_partner boolean,
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
    (p.role = 'partner'),
    COALESCE(p.role, '')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_global_users_for_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_global_users_for_staff() TO authenticated;
