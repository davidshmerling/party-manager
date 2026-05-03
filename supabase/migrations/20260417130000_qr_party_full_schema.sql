-- ============================================================================
-- QR Party — סכימה מלאה (איחוד כל המיגרציות)
-- מריץ DB חדש: guests + profiles + RLS + פונקציות RPC
-- לא לדחוף בלי `supabase db push` / SQL Editor אחרי בדיקה
-- ============================================================================

-- --- סטטוס אורח -----------------------------------------------------------
CREATE TYPE public.guest_status AS ENUM ('pending', 'entered', 'blocked');

-- --- אורחים ---------------------------------------------------------------
CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  phone varchar(64) NOT NULL,
  unique_code varchar(64) NOT NULL,
  status public.guest_status NOT NULL DEFAULT 'pending',
  entered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guests_unique_code_key UNIQUE (unique_code)
);

CREATE INDEX idx_guests_unique_code ON public.guests (unique_code);

CREATE OR REPLACE FUNCTION public.set_guests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER guests_set_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_guests_updated_at();

-- --- פרופילים / אדמינים (auth.users) --------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  display_name text,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles (role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

COMMENT ON TABLE public.profiles IS 'משתמשי ניהול — שורה מקושרת ל-auth.users; role=admin לגישה לניהול';

-- --- בדיקת admin ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_uid AND p.role = 'admin'
  );
$$;

-- --- כרטיס ציבורי (רק שם + קוד) ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_ticket(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  v_name text;
  v_code text;
BEGIN
  cleaned := trim(p_code);
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  IF position('/ticket/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/ticket/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  ELSIF position('/guest/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/guest/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  END IF;

  SELECT g.name, g.unique_code INTO v_name, v_code
  FROM public.guests g
  WHERE g.unique_code = cleaned
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('name', v_name, 'code', v_code);
END;
$$;

-- --- סריקת כניסה — רק אדמין מחובר -----------------------------------------
CREATE OR REPLACE FUNCTION public.process_guest_scan(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guests%ROWTYPE;
  cleaned text;
  now_ts timestamptz := now();
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'אין הרשאה לסריקה' USING ERRCODE = '42501';
  END IF;

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    RETURN jsonb_build_object('result', 'not_found', 'guest', null);
  END IF;

  IF position('/ticket/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/ticket/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  ELSIF position('/guest/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/guest/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  END IF;

  SELECT * INTO g FROM public.guests WHERE unique_code = cleaned FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found', 'guest', null);
  END IF;

  IF g.status = 'blocked' THEN
    RETURN jsonb_build_object(
      'result', 'blocked',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at)
    );
  END IF;

  IF g.status = 'entered' THEN
    RETURN jsonb_build_object(
      'result', 'already_entered',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at)
    );
  END IF;

  IF g.status = 'pending' THEN
    UPDATE public.guests
    SET status = 'entered', entered_at = now_ts, updated_at = now_ts
    WHERE id = g.id;
    RETURN jsonb_build_object(
      'result', 'ok',
      'guest', jsonb_build_object('name', g.name, 'entered_at', now_ts)
    );
  END IF;

  RETURN jsonb_build_object('result', 'not_found', 'guest', null);
END;
$$;

-- --- RLS אורחים — רק אדמין ------------------------------------------------
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY guests_admin_select ON public.guests
  FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

CREATE POLICY guests_admin_insert ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY guests_admin_update ON public.guests
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY guests_admin_delete ON public.guests
  FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

-- --- הרשאות ---------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON TYPE public.guest_status TO anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;

REVOKE ALL ON TABLE public.guests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guests TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_ticket(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.process_guest_scan(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_guest_scan(text) TO authenticated;
