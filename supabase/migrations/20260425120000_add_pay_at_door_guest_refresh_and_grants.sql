-- add_pay_at_door_guest: רענון חתימה, הרשאות, reload ל־PostgREST
-- מטרה: 404/42883 (undefined_function) — וידוא שקיימת רק
--   public.add_pay_at_door_guest(p_event_id uuid, p_name text DEFAULT NULL)
-- וללא overloads שגויים. לא ל־DROP את החתימה (uuid, text).
-- =============================================================================
-- בדיקה ידנית (אם חושדים בכפילויות/חתימות):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'add_pay_at_door_guest';
-- מצפים לשורה אחת: add_pay_at_door_guest | p_event_id uuid, p_name text

-- הסרת overloads ישנים/טעויות בלבד (לא את add_pay_at_door_guest(uuid, text))
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(uuid);
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(text, uuid);
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(text);

CREATE OR REPLACE FUNCTION public.add_pay_at_door_guest(
  p_event_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  now_ts timestamptz := now();
  v_name text;
  v_code text;
  g_id uuid;
  ev_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden', 'message', 'נדרשת התחברות');
  END IF;

  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request', 'message', 'חסר אירוע');
  END IF;

  IF NOT public.can_scan_event(uid, p_event_id) THEN
    SELECT e.name INTO ev_name FROM public.events e WHERE e.id = p_event_id LIMIT 1;
    RETURN jsonb_build_object(
      'ok', false, 'error', 'forbidden',
      'message', 'אין הרשאה להוסיף אורח לאירוע זה',
      'event_name', ev_name
    );
  END IF;

  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL THEN
    v_name := 'אורח (תשלום בכניסה)';
  ELSIF length(v_name) > 255 THEN
    v_name := left(v_name, 255);
  END IF;

  v_code := public.guest_random_unique_code();

  INSERT INTO public.guests (
    event_id,
    name,
    phone,
    unique_code,
    invite_bundle_code,
    status,
    entered_at,
    source
  ) VALUES (
    p_event_id,
    v_name,
    '—',
    v_code,
    v_code,
    'entered'::public.guest_status,
    now_ts,
    'pay_at_door'
  )
  RETURNING id INTO g_id;

  RETURN jsonb_build_object(
    'ok', true,
    'guest', (SELECT to_jsonb(r) FROM public.guests r WHERE r.id = g_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_pay_at_door_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
