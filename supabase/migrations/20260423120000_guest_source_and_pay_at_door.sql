-- מקור אורח: רשימה מקדימה / תשלום בכניסה; הוספה בזמן אמת דרך RPC (לסריק/סורק)
-- =============================================================================
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'list'
  CHECK (source IN ('list', 'pay_at_door'));

COMMENT ON COLUMN public.guests.source IS 'list=מהרשימה; pay_at_door=נרשם בכניסה (מסך +1)';

-- יצירת קוד URL-safe (מקביל ל־generateUniqueCode בצד הלקוח)
CREATE OR REPLACE FUNCTION public.guest_random_unique_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v text;
  i int;
BEGIN
  FOR i IN 1..10 LOOP
    v := rtrim(translate(encode(gen_random_bytes(12), 'base64'), '+/', '-_'), '=');
    IF v IS NULL OR length(v) < 8 THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.unique_code = v) THEN
      RETURN v;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'לא ניתן ליצור קוד ייחודי' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.guest_random_unique_code() FROM PUBLIC;

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
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO authenticated;
