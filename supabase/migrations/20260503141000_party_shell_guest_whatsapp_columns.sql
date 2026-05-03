-- הרחבת get_party_event_shell: invite_sent_method + מעקב Twilio / inbound
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
