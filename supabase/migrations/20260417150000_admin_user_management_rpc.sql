-- ניהול אדמינים דרך RPC בלבד (ללא SELECT ישיר על profiles לרשימת כל המשתמשים)
-- כל הפונקציות: בדיקת is_admin(auth.uid()) + SECURITY DEFINER לגישה ל-auth.users

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean
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
    (p.id IS NOT NULL)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
  u_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'משתמש לא תקין';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO admin_count FROM public.profiles;
  IF admin_count >= 3 THEN
    RAISE EXCEPTION 'מקסימום 3 אדמינים';
  END IF;

  SELECT u.email::text INTO u_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'משתמש לא קיים';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (p_user_id, u_email, NULL, 'admin');
END;
$$;

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

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO admin_count FROM public.profiles;
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'לא ניתן להסיר את האדמין האחרון';
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_users_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.promote_to_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_admin(uuid) TO authenticated;
