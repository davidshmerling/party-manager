-- רישום מחיקה רכה: deleted_at במקום DELETE פיזי על אורחים (ממשק מנהל).
-- =============================================================================
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.guests.deleted_at IS 'מועד «מחיקה» מהממשק; null = פעיל. שורה נשארת בטבלה.';

CREATE INDEX IF NOT EXISTS idx_guests_event_not_deleted
  ON public.guests (event_id)
  WHERE deleted_at IS NULL;

-- --- סטטיסטיקות — רק אורחים פעילים -----------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_stats(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total int;
  entered int;
  pending int;
  last_in timestamptz;
  ev_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF uid IS NULL OR NOT public.can_scan_event(uid, p_event_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT e.name INTO ev_name FROM public.events e WHERE e.id = p_event_id LIMIT 1;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE g.status = 'entered')::int,
    count(*) FILTER (WHERE g.status = 'pending')::int,
    max(g.entered_at)
  INTO total, entered, pending, last_in
  FROM public.guests g
  WHERE g.event_id = p_event_id
    AND g.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'event_id', p_event_id::text,
    'event_name', ev_name,
    'total_guests', total,
    'checked_in_count', entered,
    'not_checked_in_count', pending,
    'checked_in_percentage',
      CASE WHEN total > 0 THEN round((entered::numeric / total) * 100, 1) ELSE 0 END,
    'last_check_in_at', last_in
  );
END;
$$;

-- --- סריקת כניסה — לא מזהה אורח «מחוק» -------------------------------------
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

  SELECT * INTO g FROM public.guests
  WHERE unique_code = cleaned AND deleted_at IS NULL
  FOR UPDATE;
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
    WHERE id = g.id AND status = 'pending' AND event_id = p_event_id AND deleted_at IS NULL
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

-- --- כרטיס ציבורי -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_ticket_no_open_record(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  v_name text;
  v_code text;
  v_event_id uuid;
  v_phone text;
  v_above text;
  v_instruction text;
  v_below text;
  v_siblings jsonb;
  v_norm_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

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

  SELECT
    g.name,
    g.unique_code,
    g.event_id,
    g.phone,
    e.card_text_above,
    e.card_text_instruction,
    e.card_text_below
  INTO v_name, v_code, v_event_id, v_phone, v_above, v_instruction, v_below
  FROM public.guests g
  INNER JOIN public.events e ON e.id = g.event_id
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    v_siblings := to_jsonb(ARRAY[v_code]);
  ELSE
    SELECT COALESCE(
      to_jsonb(array_agg(g2.unique_code ORDER BY g2.created_at, g2.id)),
      '[]'::jsonb
    )
    INTO v_siblings
    FROM public.guests g2
    WHERE g2.event_id = v_event_id
      AND g2.deleted_at IS NULL
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'name', v_name,
    'code', v_code,
    'card_text_above', v_above,
    'card_text_instruction', v_instruction,
    'card_text_below', v_below,
    'sibling_codes', v_siblings
  );
END;
$$;

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
  v_event_id uuid;
  v_phone text;
  v_above text;
  v_instruction text;
  v_below text;
  v_siblings jsonb;
  v_norm_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

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

  SELECT
    g.name,
    g.unique_code,
    g.event_id,
    g.phone,
    e.card_text_above,
    e.card_text_instruction,
    e.card_text_below
  INTO v_name, v_code, v_event_id, v_phone, v_above, v_instruction, v_below
  FROM public.guests g
  INNER JOIN public.events e ON e.id = g.event_id
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    v_siblings := to_jsonb(ARRAY[v_code]);
  ELSE
    SELECT COALESCE(
      to_jsonb(array_agg(g2.unique_code ORDER BY g2.created_at, g2.id)),
      '[]'::jsonb
    )
    INTO v_siblings
    FROM public.guests g2
    WHERE g2.event_id = v_event_id
      AND g2.deleted_at IS NULL
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  UPDATE public.guests g3
  SET card_opened_at = now()
  WHERE g3.unique_code IN (SELECT jsonb_array_elements_text(v_siblings))
    AND g3.card_opened_at IS NULL
    AND g3.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'name', v_name,
    'code', v_code,
    'card_text_above', v_above,
    'card_text_instruction', v_instruction,
    'card_text_below', v_below,
    'sibling_codes', v_siblings
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_guest_card_open(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  v_event_id uuid;
  v_name text;
  v_phone text;
  v_norm_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    RETURN;
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

  SELECT g.event_id, g.name, g.phone
  INTO v_event_id, v_name, v_phone
  FROM public.guests g
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    UPDATE public.guests
    SET
      card_opened_at = COALESCE(card_opened_at, now()),
      updated_at = CASE WHEN card_opened_at IS NULL THEN now() ELSE updated_at END
    WHERE event_id = v_event_id
      AND unique_code = cleaned
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  UPDATE public.guests g2
  SET
    card_opened_at = COALESCE(g2.card_opened_at, now()),
    updated_at = CASE WHEN g2.card_opened_at IS NULL THEN now() ELSE g2.updated_at END
  WHERE g2.event_id = v_event_id
    AND g2.deleted_at IS NULL
    AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
    AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
END;
$$;

NOTIFY pgrst, 'reload schema';
