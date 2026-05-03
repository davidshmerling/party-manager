-- שאילתות ממוקדות לזהות אורח (שם+טלפון מנורמל) — בלי טעינת כל האורחים
-- משתמש ב־normalize_guest_phone_match ובאותה לוגיקת שם כמו ב־get_public_ticket
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_invite_bundle_code_for_event_identity(
  p_event_id uuid,
  p_name text,
  p_phone text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT g.invite_bundle_code::text
  FROM public.guests g
  WHERE g.event_id = p_event_id
    AND g.deleted_at IS NULL
    AND trim(lower(regexp_replace(g.name, '\s+', ' ', 'g'))) =
        trim(lower(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
    AND public.normalize_guest_phone_match(g.phone) = public.normalize_guest_phone_match(p_phone)
  ORDER BY g.created_at ASC, g.id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.lookup_invite_bundle_code_for_event_identity(uuid, text, text) IS
  'קוד bundle קיים לאותה זהות באירוע (לכרטיס נוסף); null אם אין';

CREATE OR REPLACE FUNCTION public.guest_ids_same_identity_in_event(
  p_event_id uuid,
  p_seed_ids uuid[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH seeds AS (
    SELECT DISTINCT
      trim(lower(regexp_replace(g.name, '\s+', ' ', 'g'))) AS norm_name,
      public.normalize_guest_phone_match(g.phone) AS norm_phone
    FROM public.guests g
    WHERE g.event_id = p_event_id
      AND g.deleted_at IS NULL
      AND g.id = ANY (p_seed_ids)
  )
  SELECT coalesce(array_agg(g2.id ORDER BY g2.created_at, g2.id), '{}'::uuid[])
  FROM public.guests g2
  JOIN seeds s
    ON trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = s.norm_name
   AND public.normalize_guest_phone_match(g2.phone) = s.norm_phone
  WHERE g2.event_id = p_event_id
    AND g2.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.guest_ids_same_identity_in_event(uuid, uuid[]) IS
  'כל מזהי האורח הפעילים באירוע עם אותה זהות כמו אחד מ־p_seed_ids';

GRANT EXECUTE ON FUNCTION public.lookup_invite_bundle_code_for_event_identity(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_ids_same_identity_in_event(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
