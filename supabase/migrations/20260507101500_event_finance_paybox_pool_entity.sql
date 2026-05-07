-- פייבוקס כבריכה חשבונאית נפרדת לכל אירוע (כולל Backfill לנתוני עבר)
-- ============================================================================

ALTER TABLE public.event_finance_lines
  ADD COLUMN IF NOT EXISTS transfer_from_kind text;

ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_transfer_from_kind_check;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_transfer_from_kind_check
  CHECK (
    transfer_from_kind IS NULL
    OR transfer_from_kind IN ('paybox', 'partner', 'selector')
  );

-- internal_transfer: מאפשר לסמן שהיעד/המקור הוא בריכת פייבוקס
ALTER TABLE public.event_finance_lines
  DROP CONSTRAINT IF EXISTS event_finance_lines_internal_transfer_income_kind_chk;

ALTER TABLE public.event_finance_lines
  ADD CONSTRAINT event_finance_lines_internal_transfer_income_kind_chk
  CHECK (
    line_kind <> 'internal_transfer'
    OR income_recipient_kind IS NULL
    OR income_recipient_kind = 'paybox'
  );

COMMENT ON COLUMN public.event_finance_lines.transfer_from_kind IS
  'internal_transfer: paybox=המקור הוא בריכת פייבוקס; אחרת null/סוג משתמש.';

COMMENT ON COLUMN public.event_finance_lines.income_recipient_kind IS
  'income/expense: סוג נמען (paybox/partner/selector). internal_transfer: null או paybox ליעד פייבוקס.';

-- --- Backfill היסטורי -------------------------------------------------------
-- לכל אירוע: מזהים "חשבון פייבוקס ישן" לפי שורות הכנסה שסומנו paybox,
-- ומעבירים שיוכים תואמים לישות בריכת פייבוקס (במקום שיוך לאדם).
WITH paybox_delegate AS (
  SELECT
    event_id,
    recipient_admin_id AS admin_id,
    COUNT(*)::int AS c,
    ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY COUNT(*) DESC, recipient_admin_id
    ) AS rn
  FROM public.event_finance_lines
  WHERE income_recipient_kind = 'paybox'
  GROUP BY event_id, recipient_admin_id
),
chosen_delegate AS (
  SELECT event_id, admin_id
  FROM paybox_delegate
  WHERE rn = 1
)
UPDATE public.event_finance_lines l
SET income_recipient_kind = 'paybox'
FROM chosen_delegate d
WHERE l.event_id = d.event_id
  AND l.line_kind = 'expense'
  AND l.recipient_admin_id = d.admin_id
  AND l.income_recipient_kind IS NULL;

-- internal_transfer היסטורי: סימון paybox רק כשיש אינדיקציה טקסטואלית "פייבוקס/paybox"
WITH paybox_delegate AS (
  SELECT
    event_id,
    recipient_admin_id AS admin_id,
    COUNT(*)::int AS c,
    ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY COUNT(*) DESC, recipient_admin_id
    ) AS rn
  FROM public.event_finance_lines
  WHERE income_recipient_kind = 'paybox'
  GROUP BY event_id, recipient_admin_id
),
chosen_delegate AS (
  SELECT event_id, admin_id
  FROM paybox_delegate
  WHERE rn = 1
)
UPDATE public.event_finance_lines l
SET income_recipient_kind = 'paybox'
FROM chosen_delegate d
WHERE l.event_id = d.event_id
  AND l.line_kind = 'internal_transfer'
  AND l.recipient_admin_id = d.admin_id
  AND l.income_recipient_kind IS NULL
  AND (
    l.person_name ILIKE '%paybox%'
    OR l.person_name ILIKE '%פייבוקס%'
  );

WITH paybox_delegate AS (
  SELECT
    event_id,
    recipient_admin_id AS admin_id,
    COUNT(*)::int AS c,
    ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY COUNT(*) DESC, recipient_admin_id
    ) AS rn
  FROM public.event_finance_lines
  WHERE income_recipient_kind = 'paybox'
  GROUP BY event_id, recipient_admin_id
),
chosen_delegate AS (
  SELECT event_id, admin_id
  FROM paybox_delegate
  WHERE rn = 1
)
UPDATE public.event_finance_lines l
SET transfer_from_kind = 'paybox'
FROM chosen_delegate d
WHERE l.event_id = d.event_id
  AND l.line_kind = 'internal_transfer'
  AND l.transfer_from_admin_id = d.admin_id
  AND l.transfer_from_kind IS NULL
  AND (
    l.person_name ILIKE '%paybox%'
    OR l.person_name ILIKE '%פייבוקס%'
  );

-- --- RPC shells: כולל transfer_from_kind -----------------------------------
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
        transfer_from_admin_id, transfer_from_kind, income_recipient_kind, is_paid, created_by, created_at, updated_at
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
      transfer_from_admin_id, transfer_from_kind, income_recipient_kind, is_paid, created_by, created_at, updated_at
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
