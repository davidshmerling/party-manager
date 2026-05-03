-- סינון list_audit_logs / list_technical_logs לפי created_at (אופציונלי)

DROP FUNCTION IF EXISTS public.list_audit_logs(int, int);
DROP FUNCTION IF EXISTS public.list_technical_logs(int, int);

CREATE OR REPLACE FUNCTION public.list_audit_logs(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_min_created_at timestamptz DEFAULT NULL,
  p_max_created_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.audit_log a
  WHERE public.is_admin((SELECT auth.uid()))
    AND (p_min_created_at IS NULL OR a.created_at >= p_min_created_at)
    AND (p_max_created_at IS NULL OR a.created_at <= p_max_created_at)
  ORDER BY a.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_audit_logs(int, int, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(int, int, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_technical_logs(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_min_created_at timestamptz DEFAULT NULL,
  p_max_created_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.technical_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.technical_log t
  WHERE public.is_admin((SELECT auth.uid()))
    AND (p_min_created_at IS NULL OR t.created_at >= p_min_created_at)
    AND (p_max_created_at IS NULL OR t.created_at <= p_max_created_at)
  ORDER BY t.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_technical_logs(int, int, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_technical_logs(int, int, timestamptz, timestamptz) TO authenticated;
