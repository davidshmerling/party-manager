-- אדמין גלובלי: עריכה ידנית של display_name בפרופיל
-- =============================================================================
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
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
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

REVOKE ALL ON FUNCTION public.admin_set_user_display_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_display_name(uuid, text) TO authenticated;
