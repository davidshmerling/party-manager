-- =============================================================================
-- יומן ביקורת (audit_log) + לוגים טכניים (technical_log)
-- רישום בשרת: טריגרים + process_guest_scan; קריאה: RPC לאדמין בלבד
-- =============================================================================

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_event_id ON public.audit_log (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_audit_log_actor ON public.audit_log (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_action ON public.audit_log (action);

COMMENT ON TABLE public.audit_log IS 'ביקורת עסקית — מי עשה מה; רישום בטריגרים / RPC, לא בלקוח ישיר';

CREATE TABLE public.technical_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  source text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  operation text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL
);

CREATE INDEX idx_technical_log_created_at ON public.technical_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_log ENABLE ROW LEVEL SECURITY;

-- אדמין בלבד קורא; אין INSERT/UPDATE/DELETE ללקוח (רק דרך פונקציות/טריגרים)
CREATE POLICY audit_log_select_admins ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

CREATE POLICY technical_log_select_admins ON public.technical_log
  FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

-- GRANT/REVOKE אחרי יצירת אובייקטי הלוג — סוף הקובץ

-- =============================================================================
-- רישור סריקה — ללא כפל עם עדכון אורח (suppress לטריגר)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_insert_scan(
  p_actor uuid,
  p_event_id uuid,
  p_guest_id uuid,
  p_result text,
  p_message text,
  p_extra jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_status text;
  m jsonb;
BEGIN
  m := coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('message', nullif(trim(p_message), ''), 'raw_result', p_result);

  IF p_result = 'forbidden' THEN
    v_action := 'scan.denied';
    v_status := 'denied';
  ELSIF p_result = 'ok' THEN
    v_action := 'scan.success';
    v_status := 'success';
  ELSIF p_result IN ('already_entered', 'already_checked_in') THEN
    v_action := 'scan.duplicate';
    v_status := 'success';
  ELSIF p_result = 'wrong_event' THEN
    v_action := 'scan.wrong_event';
    v_status := 'success';
  ELSIF p_result = 'not_found' THEN
    v_action := 'scan.not_found';
    v_status := 'success';
  ELSE
    v_action := 'scan.unknown';
    v_status := 'success';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
  VALUES (p_actor, v_action, 'scan', p_guest_id, p_event_id, v_status, m);
END;
$$;

-- =============================================================================
-- טריגר: אורחים
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tr_audit_guests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event uuid;
  v_meta jsonb;
  v_only_invite boolean;
  v_action text;
  v_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'guest.create', 'guest', NEW.id, NEW.event_id, 'success',
            jsonb_build_object('name', left(NEW.name, 100)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'guest.delete', 'guest', OLD.id, OLD.event_id, 'success',
            jsonb_build_object('name', left(OLD.name, 100)));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF coalesce(nullif(current_setting('app.suppress_guest_audit', true), ''), '') = '1' THEN
      RETURN NEW;
    END IF;

    v_event := NEW.event_id;

    v_only_invite :=
      (OLD.name IS NOT DISTINCT FROM NEW.name)
      AND (OLD.phone IS NOT DISTINCT FROM NEW.phone)
      AND (OLD.status IS NOT DISTINCT FROM NEW.status)
      AND (OLD.entered_at IS NOT DISTINCT FROM NEW.entered_at)
      AND (OLD.unique_code IS NOT DISTINCT FROM NEW.unique_code)
      AND (OLD.invite_bundle_code IS NOT DISTINCT FROM NEW.invite_bundle_code)
      AND (OLD.card_opened_at IS NOT DISTINCT FROM NEW.card_opened_at)
      AND (
        (OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at)
        OR (OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method)
      );

    IF v_only_invite THEN
      v_action := 'invite.mark_sent';
      v_meta := jsonb_build_object('method', NEW.invite_sent_method);
    ELSE
      v_action := 'guest.update';
      IF OLD.name IS DISTINCT FROM NEW.name THEN v_fields := array_append(v_fields, 'name'); END IF;
      IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_fields := array_append(v_fields, 'phone'); END IF;
      IF OLD.status IS DISTINCT FROM NEW.status THEN v_fields := array_append(v_fields, 'status'); END IF;
      IF OLD.entered_at IS DISTINCT FROM NEW.entered_at THEN v_fields := array_append(v_fields, 'entered_at'); END IF;
      IF OLD.unique_code IS DISTINCT FROM NEW.unique_code THEN v_fields := array_append(v_fields, 'unique_code'); END IF;
      IF OLD.invite_bundle_code IS DISTINCT FROM NEW.invite_bundle_code THEN v_fields := array_append(v_fields, 'invite_bundle_code'); END IF;
      IF OLD.card_opened_at IS DISTINCT FROM NEW.card_opened_at THEN v_fields := array_append(v_fields, 'card_opened_at'); END IF;
      IF OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at
         OR OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method
      THEN
        v_fields := array_append(v_fields, 'whatsapp_invite');
      END IF;
      v_meta := jsonb_build_object('fields', to_jsonb(v_fields), 'name', left(NEW.name, 80));
    END IF;

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, v_action, 'guest', NEW.id, v_event, 'success', v_meta);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_guests ON public.guests;
CREATE TRIGGER tr_audit_guests
  AFTER INSERT OR UPDATE OR DELETE ON public.guests
  FOR EACH ROW
  EXECUTE PROCEDURE public.tr_audit_guests();

-- =============================================================================
-- טריגר: אירועים
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tr_audit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'event.create', 'event', NEW.id, NEW.id, 'success', jsonb_build_object('name', left(NEW.name, 200)));
    RETURN NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'event.update', 'event', NEW.id, NEW.id, 'success', jsonb_build_object('name', left(NEW.name, 200)));
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'event.delete', 'event', OLD.id, OLD.id, 'success', jsonb_build_object('name', left(OLD.name, 200)));
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_events ON public.events;
CREATE TRIGGER tr_audit_events
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE PROCEDURE public.tr_audit_events();

-- =============================================================================
-- טריגר: צוות אירוע
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tr_audit_event_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'staff.add', 'event_staff', NEW.id, NEW.event_id, 'success',
            jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role));
    RETURN NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'staff.role_change', 'event_staff', NEW.id, NEW.event_id, 'success',
            jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role, 'old_role', OLD.role));
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'staff.remove', 'event_staff', OLD.id, OLD.event_id, 'success',
            jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role));
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_event_staff ON public.event_staff;
CREATE TRIGGER tr_audit_event_staff
  AFTER INSERT OR UPDATE OR DELETE ON public.event_staff
  FOR EACH ROW
  EXECUTE PROCEDURE public.tr_audit_event_staff();

-- =============================================================================
-- טריגר: פרופילים (אדמין גלובלי)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tr_audit_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'profile.create', 'profile', NEW.id, NULL, 'success',
            jsonb_build_object('role', NEW.role, 'email', left(NEW.email, 120)));
    RETURN NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      v_meta := jsonb_build_object('user_id', NEW.id, 'old_role', OLD.role, 'new_role', NEW.role);
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, 'profile.role_change', 'profile', NEW.id, NULL, 'success', v_meta);
    ELSE
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, 'profile.update', 'profile', NEW.id, NULL, 'success', jsonb_build_object('user_id', NEW.id));
    END IF;
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'profile.delete', 'profile', OLD.id, NULL, 'success', jsonb_build_object('email', left(OLD.email, 120), 'role', OLD.role));
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_profiles ON public.profiles;
CREATE TRIGGER tr_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.tr_audit_profiles();

-- =============================================================================
-- process_guest_scan — יומן סריקה + דיכוי guest.update פעמי
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_guest_scan(p_code text, p_event_id uuid DEFAULT NULL)
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
  ev_name text;
  updated_row public.guests%ROWTYPE;
  ret jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF caller IS NULL THEN
    ret := jsonb_build_object(
      'status', 'forbidden', 'result', 'forbidden', 'message', 'נדרשת התחברות',
      'guest', null, 'guest_name', null, 'checked_in_at', null, 'event_id', null, 'event_name', null
    );
    PERFORM public.audit_insert_scan(NULL, p_event_id, NULL, 'forbidden', 'נדרשת התחברות', ret);
    RETURN ret;
  END IF;

  IF p_event_id IS NULL THEN
    ret := jsonb_build_object(
      'status', 'forbidden', 'result', 'forbidden', 'message', 'חסר מזהה אירוע',
      'guest', null, 'guest_name', null, 'checked_in_at', null, 'event_id', null, 'event_name', null
    );
    PERFORM public.audit_insert_scan(caller, NULL, NULL, 'forbidden', 'חסר מזהה אירוע', ret);
    RETURN ret;
  END IF;

  IF NOT public.can_scan_event(caller, p_event_id) THEN
    ret := jsonb_build_object(
      'status', 'forbidden', 'result', 'forbidden', 'message', 'אין הרשאת סריקה לאירוע זה',
      'guest', null, 'guest_name', null, 'checked_in_at', null, 'event_id', p_event_id::text, 'event_name', null
    );
    SELECT name INTO ev_name FROM public.events WHERE id = p_event_id LIMIT 1;
    ret := ret || jsonb_build_object('event_name', ev_name);
    PERFORM public.audit_insert_scan(caller, p_event_id, NULL, 'forbidden', 'אין הרשאת סריקה', ret);
    RETURN ret;
  END IF;

  SELECT name INTO ev_name FROM public.events WHERE id = p_event_id LIMIT 1;

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    ret := jsonb_build_object(
      'status', 'not_found', 'result', 'not_found', 'message', 'קוד ריק', 'guest', null,
      'guest_name', null, 'checked_in_at', null, 'event_id', p_event_id::text, 'event_name', ev_name
    );
    PERFORM public.audit_insert_scan(caller, p_event_id, NULL, 'not_found', 'קוד ריק', ret);
    RETURN ret;
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
    ret := jsonb_build_object(
      'status', 'not_found', 'result', 'not_found', 'message', 'לא נמצא כרטיס',
      'guest', null, 'guest_name', null, 'checked_in_at', null, 'event_id', p_event_id::text, 'event_name', ev_name
    );
    PERFORM public.audit_insert_scan(caller, p_event_id, NULL, 'not_found', 'לא נמצא כרטיס', ret);
    RETURN ret;
  END IF;

  IF g.event_id IS DISTINCT FROM p_event_id THEN
    ret := jsonb_build_object(
      'status', 'wrong_event', 'result', 'wrong_event', 'message', 'הכרטיס שייך לאירוע אחר',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
      'guest_name', g.name, 'checked_in_at', g.entered_at, 'event_id', p_event_id::text, 'event_name', ev_name
    );
    PERFORM public.audit_insert_scan(caller, p_event_id, g.id, 'wrong_event', 'אירוע שגוי', ret);
    RETURN ret;
  END IF;

  IF g.status = 'entered' THEN
    ret := jsonb_build_object(
      'status', 'already_checked_in', 'result', 'already_entered', 'message', 'כבר נכנס',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
      'guest_name', g.name, 'checked_in_at', g.entered_at, 'event_id', p_event_id::text, 'event_name', ev_name
    );
    PERFORM public.audit_insert_scan(caller, p_event_id, g.id, 'already_entered', 'כבר נכנס', ret);
    RETURN ret;
  END IF;

  IF g.status = 'pending' THEN
    PERFORM set_config('app.suppress_guest_audit', '1', true);
    UPDATE public.guests
    SET status = 'entered', entered_at = now_ts, updated_at = now_ts
    WHERE id = g.id AND status = 'pending' AND event_id = p_event_id
    RETURNING * INTO updated_row;
    PERFORM set_config('app.suppress_guest_audit', '0', true);

    IF updated_row.id IS NOT NULL THEN
      ret := jsonb_build_object(
        'status', 'ok', 'result', 'ok', 'message', 'נכנס',
        'guest', jsonb_build_object('name', updated_row.name, 'entered_at', updated_row.entered_at),
        'guest_name', updated_row.name, 'checked_in_at', updated_row.entered_at,
        'event_id', p_event_id::text, 'event_name', ev_name
      );
      PERFORM public.audit_insert_scan(caller, p_event_id, g.id, 'ok', 'נכנס', ret);
      RETURN ret;
    END IF;

    SELECT * INTO g FROM public.guests WHERE id = g.id;
    IF g.status = 'entered' THEN
      ret := jsonb_build_object(
        'status', 'already_checked_in', 'result', 'already_entered', 'message', 'כבר נכנס',
        'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at),
        'guest_name', g.name, 'checked_in_at', g.entered_at, 'event_id', p_event_id::text, 'event_name', ev_name
      );
      PERFORM public.audit_insert_scan(caller, p_event_id, g.id, 'already_entered', 'מירוץ/כניסה כפולה', ret);
      RETURN ret;
    END IF;
  END IF;

  ret := jsonb_build_object(
    'status', 'not_found', 'result', 'not_found', 'message', 'לא ניתן לעדכן', 'guest', null,
    'guest_name', null, 'checked_in_at', null, 'event_id', p_event_id::text, 'event_name', ev_name
  );
  PERFORM public.audit_insert_scan(caller, p_event_id, g.id, 'not_found', 'לא ניתן לעדכן', ret);
  RETURN ret;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_insert_scan(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
-- פונקציה פנימית — לא מיוצאת ללקוח

REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.technical_log FROM PUBLIC, anon, authenticated, service_role;
-- אין GRANT SELECT ישיר — קריאה דרך list_* (SECURITY DEFINER) בלבד

-- =============================================================================
-- לוגים טכניים: כתיבה (אימות) + קריאה (אדמין)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_technical_event(
  p_level text,
  p_source text,
  p_operation text,
  p_message text,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_correlation_id text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_msg text;
  v_level text;
  v_src text;
  v_op text;
BEGIN
  v_user := auth.uid();
  v_msg := left(trim(coalesce(p_message, '')), 4000);
  IF v_msg = '' THEN
    v_msg := '(no message)';
  END IF;

  v_level := lower(trim(p_level));
  IF v_level NOT IN ('info', 'warn', 'error') THEN
    v_level := 'error';
  END IF;

  v_src := left(trim(coalesce(p_source, 'frontend')), 32);
  v_op := left(trim(coalesce(p_operation, 'unknown')), 200);

  INSERT INTO public.technical_log (user_id, source, level, operation, message, context, correlation_id, event_id)
  VALUES (v_user, v_src, v_level, v_op, v_msg, coalesce(p_context, '{}'::jsonb), nullif(left(p_correlation_id, 64), ''), p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.log_technical_event(text, text, text, text, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_technical_event(text, text, text, text, jsonb, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.audit_log a
  WHERE public.is_admin((SELECT auth.uid()))
  ORDER BY a.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_audit_logs(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_technical_logs(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
RETURNS SETOF public.technical_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.technical_log t
  WHERE public.is_admin((SELECT auth.uid()))
  ORDER BY t.created_at DESC
  LIMIT least(greatest(p_limit, 1), 500)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_technical_logs(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_technical_logs(int, int) TO authenticated;
