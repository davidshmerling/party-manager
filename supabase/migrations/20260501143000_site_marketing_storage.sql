-- תמונות אתר ציבורי (אייקון, מי אנחנו, hero, גלריה ממוספרת) — אחסון ב־Storage + מטא־דאטה בטבלה

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-marketing',
  'site-marketing',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.site_marketing_assets (
  slot text PRIMARY KEY,
  object_path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_marketing_assets_slot_format CHECK (
    slot IN ('icon', 'about', 'hero')
    OR slot ~ '^gallery-[0-9]{2}$'
  )
);

COMMENT ON TABLE public.site_marketing_assets IS
  'מיפוי slot → נתיב קובץ ב-bucket site-marketing; ציבורי לקריאה';

CREATE OR REPLACE FUNCTION public.set_site_marketing_assets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_marketing_assets_set_updated ON public.site_marketing_assets;
CREATE TRIGGER site_marketing_assets_set_updated
  BEFORE INSERT OR UPDATE ON public.site_marketing_assets
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_site_marketing_assets_updated_at();

ALTER TABLE public.site_marketing_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_marketing_assets_select_all
  ON public.site_marketing_assets FOR SELECT
  USING (true);

CREATE POLICY site_marketing_assets_insert_staff
  ON public.site_marketing_assets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY site_marketing_assets_update_staff
  ON public.site_marketing_assets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY site_marketing_assets_delete_staff
  ON public.site_marketing_assets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE OR REPLACE FUNCTION public.get_site_marketing_assets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'icon', (SELECT a.object_path FROM public.site_marketing_assets a WHERE a.slot = 'icon'),
      'about', (SELECT a.object_path FROM public.site_marketing_assets a WHERE a.slot = 'about'),
      'hero', (SELECT a.object_path FROM public.site_marketing_assets a WHERE a.slot = 'hero'),
      'gallery', (
        SELECT COALESCE(
          jsonb_object_agg(a.slot, a.object_path),
          '{}'::jsonb
        )
        FROM public.site_marketing_assets a
        WHERE a.slot ~ '^gallery-[0-9]{2}$'
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_site_marketing_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_marketing_assets() TO anon, authenticated;

-- Storage: קריאה לכולם; כתיבה — אדמין/שותף
CREATE POLICY site_marketing_storage_select_public
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-marketing');

CREATE POLICY site_marketing_storage_insert_staff
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY site_marketing_storage_update_staff
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  )
  WITH CHECK (
    bucket_id = 'site-marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY site_marketing_storage_delete_staff
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );
