-- תפקיד member (משתמש רגיל), טבלת עמוד ציבורי לאירועים, RPC לקריאה ציבורית ולעריכת אדמין

-- --- פרופילים: הוספת member -----------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('partner', 'admin', 'scanner', 'member'));

COMMENT ON COLUMN public.profiles.role IS
  'partner|admin — ניהול; scanner — סריקה לפי אירוע; member — משתמש רגיל (מסיבות ציבוריות בלבד)';

-- --- פרופיל אוטומטי בהרשמה -------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email::text, ''),
    NULL,
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;

-- משתמשים קיימים בלי שורת profiles — משתמש רגיל (לא דורס שותף/אדמין/סורק)
INSERT INTO public.profiles (id, email, display_name, role)
SELECT u.id::uuid, COALESCE(u.email::text, ''), NULL, 'member'::text
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- --- עמוד ציבורי לאירוע -----------------------------------------------------
CREATE TABLE public.event_public_pages (
  event_id uuid PRIMARY KEY REFERENCES public.events (id) ON DELETE CASCADE,
  public_title text,
  public_description text,
  public_date timestamptz,
  public_location text,
  public_image_url text,
  paybox_url text,
  is_public boolean NOT NULL DEFAULT false,
  public_status text NOT NULL DEFAULT 'draft'
    CHECK (public_status IN ('draft', 'published', 'closed')),
  public_what_included text,
  public_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_event_public_pages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_public_pages_set_updated_at ON public.event_public_pages;

CREATE TRIGGER event_public_pages_set_updated_at
  BEFORE UPDATE ON public.event_public_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_public_pages_updated_at();

CREATE INDEX idx_event_public_pages_published
  ON public.event_public_pages (public_date)
  WHERE public_status = 'published' AND is_public = true;

ALTER TABLE public.event_public_pages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_public_pages FROM PUBLIC;
GRANT ALL ON TABLE public.event_public_pages TO postgres;

COMMENT ON TABLE public.event_public_pages IS
  'תוכן עמוד המסיבה הציבורי — גישה ישירה לטבלה חסומה; רק דרך RPC מאובטחים';

-- --- רשימה ציבורית (anon + authenticated) ----------------------------------
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
  ORDER BY p.public_date ASC NULLS LAST, e.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_public_party_pages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_party_pages() TO anon, authenticated;

-- --- פרטי מסיבה ציבוריים (פרט מפרסם בלבד) -----------------------------------
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
    AND p.public_status = 'published';
$$;

REVOKE ALL ON FUNCTION public.get_public_party_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_party_page(uuid) TO anon, authenticated;

-- --- טעינת טופס אדמין (טיוטה / פרסום — לפי הרשאת ניהול אירוע) ---------------
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
    'public_notes', p.public_notes
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
      'public_notes', NULL
    );
  ELSE
    j := j || jsonb_build_object('event_name', ev_name);
  END IF;

  RETURN j;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_event_public_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_event_public_page(uuid) TO authenticated;

-- --- שמירת עמוד ציבורי (ניהול אירוע בלבד) ------------------------------------
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
  p_public_notes text DEFAULT NULL
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
    public_notes
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
    NULLIF(trim(p_public_notes), '')
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
    public_notes = EXCLUDED.public_notes;

  RETURN public.admin_get_event_public_page(p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_event_public_page(
  uuid, text, text, timestamptz, text, text, text, boolean, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_upsert_event_public_page(
  uuid, text, text, timestamptz, text, text, text, boolean, text, text, text
) TO authenticated;
