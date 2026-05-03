-- אדמין גלובלי לא יכול להיות משויך כסורק לאירוע; לא ניתן לקדם לסורק אם כבר אדמין

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

  IF p_role = 'scanner' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'אדמין גלובלי לא יכול להיות משויך כסורק לאירוע';
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

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'אדמין גלובלי לא יכול להיות סורק. הסירו תחילה את הרשאת האדמין.';
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
