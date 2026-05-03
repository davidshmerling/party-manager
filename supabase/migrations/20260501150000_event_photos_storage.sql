-- תמונות אירועים ציבוריות — bucket + מטא-דאטה בטבלה

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'party-photos',
  'party-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_photos IS
  'תמונות אירוע ב-bucket party-photos, ממוין לפי sort_order ואז created_at';

CREATE INDEX IF NOT EXISTS event_photos_event_order_idx
  ON public.event_photos (event_id, is_active, sort_order, created_at);

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_photos_select_public
  ON public.event_photos FOR SELECT
  USING (true);

CREATE POLICY event_photos_insert_staff
  ON public.event_photos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY event_photos_update_staff
  ON public.event_photos FOR UPDATE TO authenticated
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

CREATE POLICY event_photos_delete_staff
  ON public.event_photos FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY party_photos_storage_select_public
  ON storage.objects FOR SELECT
  USING (bucket_id = 'party-photos');

CREATE POLICY party_photos_storage_insert_staff
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'party-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY party_photos_storage_update_staff
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'party-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  )
  WITH CHECK (
    bucket_id = 'party-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );

CREATE POLICY party_photos_storage_delete_staff
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'party-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'partner')
    )
  );
