-- תשלום בכניסה: סכום (חובה) לכל כרטיס, כמות (ברירת 1), שמות «נכנס בכניסה N» + שורות הכנסה
-- מחליף את ‎add_pay_at_door_guest(uuid, text)‎ ב־(uuid, numeric, int, text)
-- =============================================================================
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(uuid);
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(text, uuid);
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(text);
DROP FUNCTION IF EXISTS public.add_pay_at_door_guest(uuid, text);

CREATE OR REPLACE FUNCTION public.add_pay_at_door_guest(
  p_event_id uuid,
  p_amount numeric,
  p_quantity int DEFAULT 1,
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
  v_i int;
  v_qty int;
  v_recipient uuid;
  prefix text;
  g_ids uuid[] := '{}';
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

  IF p_amount IS NULL OR p_amount < 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request', 'message', 'נדרש סכום (מינימום 0.01 ‏₪) לכל כרטיס');
  END IF;

  v_qty := coalesce(p_quantity, 1);
  IF v_qty < 1 OR v_qty > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request', 'message', 'כמות: בין 1 ל־100');
  END IF;

  /* נמען הכנסה: אם המסייר שותף — הוא; אחרת שותף הראשון לפי ‎id */
  IF public.is_partner(uid) THEN
    v_recipient := uid;
  ELSE
    SELECT p.id
    INTO v_recipient
    FROM public.profiles p
    WHERE p.role = 'partner'
    ORDER BY p.id
    LIMIT 1;
    IF v_recipient IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'bad_config',
        'message', 'אין שותף במערכת — לא ניתן לרשום הכנסה; צור קשר עם מנהל.'
      );
    END IF;
  END IF;

  prefix := nullif(btrim(p_name), '');

  FOR v_i IN 1..v_qty LOOP
    IF prefix IS NULL THEN
      v_name := 'נכנס בכניסה ' || v_i::text;
    ELSE
      v_name := prefix || ' — נכנס בכניסה ' || v_i::text;
    END IF;
    IF length(v_name) > 255 THEN
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
    g_ids := array_append(g_ids, g_id);

    INSERT INTO public.event_finance_lines (
      event_id,
      line_kind,
      person_name,
      phone,
      amount,
      recipient_admin_id,
      is_paid,
      created_by
    ) VALUES (
      p_event_id,
      'income',
      v_name,
      '—',
      round(p_amount::numeric, 2),
      v_recipient,
      true,
      uid
    );

  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'guests',
    coalesce(
      (
        SELECT jsonb_agg(s.j ORDER BY s.ord)
        FROM (
          SELECT t.ord, to_jsonb(r) AS j
          FROM unnest(g_ids) WITH ORDINALITY AS t (gid, ord)
          JOIN public.guests r ON r.id = t.gid
        ) s
      ),
      '[]'::jsonb
    ),
    'count', v_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_pay_at_door_guest(uuid, numeric, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, numeric, int, text) TO anon;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, numeric, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, numeric, int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
