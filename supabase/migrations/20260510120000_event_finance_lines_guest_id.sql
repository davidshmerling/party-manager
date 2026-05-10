-- קישור שורות הכנסה לאורח לפי guest_id (במקום הסתמכות על שם+טלפון בלבד)
-- =============================================================================
ALTER TABLE public.event_finance_lines
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_finance_lines.guest_id IS
  'אורח (כרטיס) ששורת ההכנסה משויכת אליו; income מרשימת אורחים. null = הוצאה/העברה או נתונים ישנים';

CREATE INDEX IF NOT EXISTS idx_event_finance_lines_income_guest
  ON public.event_finance_lines (event_id, guest_id)
  WHERE line_kind = 'income' AND guest_id IS NOT NULL;

-- Backfill: התאמה חד-משמעית (אורח יחיד לאותה שורת finance)
UPDATE public.event_finance_lines l
SET guest_id = s.guest_id
FROM (
  SELECT
    l2.id AS line_id,
    (array_agg(g.id ORDER BY g.created_at ASC, g.id ASC))[1] AS guest_id
  FROM public.event_finance_lines l2
  INNER JOIN public.guests g
    ON g.event_id = l2.event_id
    AND g.deleted_at IS NULL
    AND trim(g.name) = trim(l2.person_name)
    AND trim(g.phone) = trim(l2.phone)
  WHERE l2.line_kind = 'income'
    AND l2.guest_id IS NULL
  GROUP BY l2.id
  HAVING count(*) = 1
) s
WHERE l.id = s.line_id;

-- Backfill: כמה אורחים לאותה זהות — צימוד לפי סדר created_at
WITH ranked_lines AS (
  SELECT
    id,
    event_id,
    trim(person_name) AS pn,
    trim(phone) AS ph,
    row_number() OVER (
      PARTITION BY event_id, trim(person_name), trim(phone)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.event_finance_lines
  WHERE line_kind = 'income'
    AND guest_id IS NULL
),
ranked_guests AS (
  SELECT
    id,
    event_id,
    trim(name) AS gn,
    trim(phone) AS gp,
    row_number() OVER (
      PARTITION BY event_id, trim(name), trim(phone)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.guests
  WHERE deleted_at IS NULL
)
UPDATE public.event_finance_lines l
SET guest_id = g.id
FROM ranked_lines rl
INNER JOIN ranked_guests g
  ON g.event_id = rl.event_id
  AND g.gn = rl.pn
  AND g.gp = rl.ph
  AND g.rn = rl.rn
WHERE l.id = rl.id
  AND l.guest_id IS NULL;

-- תשלום בכניסה: שורת הכנסה עם אותו guest שנוצר בלולאה
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
  v_income_kind text;
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

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'scanner') THEN
    v_income_kind := 'selector';
    v_recipient := uid;
  ELSIF public.is_partner(uid) THEN
    v_income_kind := 'partner';
    v_recipient := uid;
  ELSE
    v_income_kind := 'partner';
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
      event_id, name, phone, unique_code, invite_bundle_code, status, entered_at, source
    ) VALUES (
      p_event_id, v_name, '—', v_code, v_code, 'entered'::public.guest_status, now_ts, 'pay_at_door'
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
      created_by,
      income_recipient_kind,
      guest_id
    ) VALUES (
      p_event_id,
      'income',
      v_name,
      '—',
      round(p_amount::numeric, 2),
      v_recipient,
      true,
      uid,
      v_income_kind,
      g_id
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

-- --- RPC shells: כולל guest_id -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_party_event_shell(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  g jsonb := '[]'::jsonb;
  f jsonb := '[]'::jsonb;
  s jsonb := '[]'::jsonb;
  gu jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL OR NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.name ASC, t.created_at ASC), '[]'::jsonb)
  INTO g
  FROM (
    SELECT
      id, event_id, name, phone, source, unique_code, invite_bundle_code, status,
      entered_at, card_opened_at, whatsapp_invite_sent_at, invite_sent_method,
      whatsapp_last_inbound_at, whatsapp_invite_twilio_sid, whatsapp_invite_twilio_status,
      created_at, updated_at
    FROM public.guests
    WHERE event_id = p_event_id AND deleted_at IS NULL
  ) t;

  IF public.is_partner(uid) THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(fl) ORDER BY fl.created_at DESC), '[]'::jsonb)
    INTO f
    FROM (
      SELECT
        id, event_id, line_kind, person_name, phone, amount, recipient_admin_id,
        transfer_from_admin_id, transfer_from_kind, income_recipient_kind, is_paid, created_by,
        guest_id, created_at, updated_at
      FROM public.event_finance_lines
      WHERE event_id = p_event_id
      ORDER BY created_at DESC
    ) fl;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', es.id,
      'user_id', es.user_id,
      'email', COALESCE(u.email::text, ''),
      'role', es.role,
      'created_at', es.created_at
    ) ORDER BY COALESCE(u.email::text, '')
  ), '[]'::jsonb)
  INTO s
  FROM public.event_staff es
  LEFT JOIN auth.users u ON u.id = es.user_id
  WHERE es.event_id = p_event_id;

  IF public.is_admin(uid) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', u.id,
      'email', COALESCE(u.email::text, ''),
      'display_name', COALESCE(p.display_name, ''),
      'is_admin', (p.role = 'admin'),
      'is_partner', (p.role = 'partner'),
      'profile_role', COALESCE(p.role, '')
    ) ORDER BY u.created_at ASC), '[]'::jsonb)
    INTO gu
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id;
  END IF;

  RETURN jsonb_build_object(
    'guests', g,
    'event_finance_lines', f,
    'event_staff', s,
    'global_users', gu
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_page_shell(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  f jsonb := '[]'::jsonb;
  s jsonb := '[]'::jsonb;
  au jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_partner(uid) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(fl) ORDER BY fl.created_at DESC), '[]'::jsonb)
  INTO f
  FROM (
    SELECT
      id, event_id, line_kind, person_name, phone, amount, recipient_admin_id,
      transfer_from_admin_id, transfer_from_kind, income_recipient_kind, is_paid, created_by,
      guest_id, created_at, updated_at
    FROM public.event_finance_lines
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
  ) fl;

  IF public.can_manage_event(uid, p_event_id) THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', es.id,
        'user_id', es.user_id,
        'email', COALESCE(u.email::text, ''),
        'role', es.role,
        'created_at', es.created_at
      ) ORDER BY COALESCE(u.email::text, '')
    ), '[]'::jsonb)
    INTO s
    FROM public.event_staff es
    LEFT JOIN auth.users u ON u.id = es.user_id
    WHERE es.event_id = p_event_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', COALESCE(u.email::text, ''),
    'display_name', COALESCE(p.display_name, ''),
    'is_admin', (p.role = 'admin'),
    'is_partner', (p.role = 'partner'),
    'profile_role', COALESCE(p.role, '')
  ) ORDER BY u.created_at ASC), '[]'::jsonb)
  INTO au
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id;

  RETURN jsonb_build_object(
    'event_finance_lines', f,
    'event_staff', s,
    'admin_users', au
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
