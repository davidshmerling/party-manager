-- תאריך/שעה עד אליהם העמוד הציבורי מוצג ברשימה ובפרטים (אחרי זה נעלם מהאתר הציבורי)

ALTER TABLE public.event_public_pages
  ADD COLUMN IF NOT EXISTS public_display_until timestamptz;

COMMENT ON COLUMN public.event_public_pages.public_display_until IS
  'עד מתי להציג את המסיבה באתר הציבורי; NULL = ללא הגבלה';

-- רשימה ציבורית — רק עדיין בתוקף התצוגה
CREATE OR REPLACE FUNCTION public.list_public_party_pages()
RETURNS TABLE (
  event_id uuid,
  public_title text,
  public_description text,
  public_date timestamptz,
  public_location text,
  public_image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.event_id,
    COALESCE(NULLIF(trim(p.public_title), ''), e.name) AS public_title,
    p.public_description,
    p.public_date,
    p.public_location,
    p.public_image_url
  FROM public.event_public_pages p
  INNER JOIN public.events e ON e.id = p.event_id
  WHERE p.is_public = true
    AND p.public_status = 'published'
    AND (p.public_display_until IS NULL OR p.public_display_until >= now())
  ORDER BY p.public_date ASC NULLS LAST, e.created_at ASC;
$$;

-- פרטים ציבוריים — לאחר תאריך ההצגה לא מחזירים שורה
CREATE OR REPLACE FUNCTION public.get_public_party_page(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'event_id', p.event_id,
    'public_title', COALESCE(NULLIF(trim(p.public_title), ''), e.name),
    'public_description', p.public_description,
    'public_date', p.public_date,
    'public_location', p.public_location,
    'public_image_url', p.public_image_url,
    'paybox_url', p.paybox_url,
    'public_what_included', p.public_what_included,
    'public_notes', p.public_notes
  )
  FROM public.event_public_pages p
  INNER JOIN public.events e ON e.id = p.event_id
  WHERE p.event_id = p_event_id
    AND p.is_public = true
    AND p.public_status = 'published'
    AND (p.public_display_until IS NULL OR p.public_display_until >= now());
$$;

-- אדמין — טופס כולל public_display_until
CREATE OR REPLACE FUNCTION public.admin_get_event_public_page(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ev_name text;
  j jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'נדרשת התחברות' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  SELECT e.name INTO ev_name FROM public.events e WHERE e.id = p_event_id;
  IF ev_name IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'event_id', p.event_id,
    'event_name', ev_name,
    'public_title', p.public_title,
    'public_description', p.public_description,
    'public_date', p.public_date,
    'public_location', p.public_location,
    'public_image_url', p.public_image_url,
    'paybox_url', p.paybox_url,
    'is_public', p.is_public,
    'public_status', p.public_status,
    'public_what_included', p.public_what_included,
    'public_notes', p.public_notes,
    'public_display_until', p.public_display_until
  )
  INTO j
  FROM public.event_public_pages p
  WHERE p.event_id = p_event_id;

  IF j IS NULL THEN
    j := jsonb_build_object(
      'event_id', p_event_id,
      'event_name', ev_name,
      'public_title', NULL,
      'public_description', NULL,
      'public_date', NULL,
      'public_location', NULL,
      'public_image_url', NULL,
      'paybox_url', NULL,
      'is_public', false,
      'public_status', 'draft',
      'public_what_included', NULL,
      'public_notes', NULL,
      'public_display_until', NULL
    );
  ELSE
    j := j || jsonb_build_object('event_name', ev_name);
  END IF;

  RETURN j;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_upsert_event_public_page(
  uuid, text, text, timestamptz, text, text, text, boolean, text, text, text
);

CREATE OR REPLACE FUNCTION public.admin_upsert_event_public_page(
  p_event_id uuid,
  p_public_title text DEFAULT NULL,
  p_public_description text DEFAULT NULL,
  p_public_date timestamptz DEFAULT NULL,
  p_public_location text DEFAULT NULL,
  p_public_image_url text DEFAULT NULL,
  p_paybox_url text DEFAULT NULL,
  p_is_public boolean DEFAULT NULL,
  p_public_status text DEFAULT NULL,
  p_public_what_included text DEFAULT NULL,
  p_public_notes text DEFAULT NULL,
  p_public_display_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'נדרשת התחברות' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_event(uid, p_event_id) THEN
    RAISE EXCEPTION 'אין הרשאה' USING ERRCODE = '42501';
  END IF;
  IF p_public_status IS NOT NULL AND p_public_status NOT IN ('draft', 'published', 'closed') THEN
    RAISE EXCEPTION 'סטטוס לא תקין';
  END IF;

  INSERT INTO public.event_public_pages (
    event_id,
    public_title,
    public_description,
    public_date,
    public_location,
    public_image_url,
    paybox_url,
    is_public,
    public_status,
    public_what_included,
    public_notes,
    public_display_until
  )
  VALUES (
    p_event_id,
    NULLIF(trim(p_public_title), ''),
    NULLIF(trim(p_public_description), ''),
    p_public_date,
    NULLIF(trim(p_public_location), ''),
    NULLIF(trim(p_public_image_url), ''),
    NULLIF(trim(p_paybox_url), ''),
    COALESCE(p_is_public, false),
    COALESCE(p_public_status, 'draft'),
    NULLIF(trim(p_public_what_included), ''),
    NULLIF(trim(p_public_notes), ''),
    p_public_display_until
  )
  ON CONFLICT (event_id) DO UPDATE SET
    public_title = EXCLUDED.public_title,
    public_description = EXCLUDED.public_description,
    public_date = EXCLUDED.public_date,
    public_location = EXCLUDED.public_location,
    public_image_url = EXCLUDED.public_image_url,
    paybox_url = EXCLUDED.paybox_url,
    is_public = EXCLUDED.is_public,
    public_status = EXCLUDED.public_status,
    public_what_included = EXCLUDED.public_what_included,
    public_notes = EXCLUDED.public_notes,
    public_display_until = EXCLUDED.public_display_until;

  RETURN public.admin_get_event_public_page(p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_event_public_page(
  uuid, text, text, timestamptz, text, text, text, boolean, text, text, text, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_upsert_event_public_page(
  uuid, text, text, timestamptz, text, text, text, boolean, text, text, text, timestamptz
) TO authenticated;
