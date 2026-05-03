-- אצווה: מספר קריאות HTTP -> קריאת RPC אחת (לוגיקת הרשאה כמו ב־RLS / RPCים הקיימים)
-- =============================================================================

-- --- מעטפת דף אורחים: אורחים + מסמכי כספים (שותף) + צוות אירוע + משתמשים גלובליים
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
      entered_at, card_opened_at, whatsapp_invite_sent_at, created_at, updated_at
    FROM public.guests
    WHERE event_id = p_event_id AND deleted_at IS NULL
  ) t;

  IF public.is_partner(uid) THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(fl) ORDER BY fl.created_at DESC), '[]'::jsonb)
    INTO f
    FROM (
      SELECT
        id, event_id, line_kind, person_name, phone, amount, recipient_admin_id,
        transfer_from_admin_id, income_recipient_kind, is_paid, created_by, created_at, updated_at
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

REVOKE ALL ON FUNCTION public.get_party_event_shell(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_party_event_shell(uuid) TO authenticated;

-- --- מעטפת דף כספים: שורות + צוות + רשימת אדמינים (שותף בלבד; מסנן לפי אירוע)
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
      transfer_from_admin_id, income_recipient_kind, is_paid, created_by, created_at, updated_at
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

REVOKE ALL ON FUNCTION public.get_finance_page_shell(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_page_shell(uuid) TO authenticated;

-- --- דף סטטיסטיקה: אותן סטטיסטיקות כמו get_event_stats + זמני כניסה לגרף (קריאת HTTP אחת)
CREATE OR REPLACE FUNCTION public.get_event_stats_page_bundle(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  stats jsonb;
  et jsonb;
BEGIN
  IF uid IS NULL OR NOT public.can_scan_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;

  stats := public.get_event_stats(p_event_id);

  IF stats ? 'error' AND stats->>'error' = 'forbidden' THEN
    RETURN jsonb_build_object('error', 'forbidden', 'stats', 'null'::jsonb, 'entry_times', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', g.id, 'entered_at', g.entered_at) ORDER BY g.entered_at ASC
  ), '[]'::jsonb)
  INTO et
  FROM public.guests g
  WHERE g.event_id = p_event_id
    AND g.deleted_at IS NULL
    AND g.entered_at IS NOT NULL;

  RETURN jsonb_build_object('stats', stats, 'entry_times', et);
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_stats_page_bundle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_stats_page_bundle(uuid) TO authenticated;
