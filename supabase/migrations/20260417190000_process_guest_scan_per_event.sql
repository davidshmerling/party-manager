-- סריקת כניסה: אופציונלי p_event_id — אם הכרטיס לאייש את אותה מסיבה, לא מעדכנים סטטוס

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

  IF p_event_id IS NOT NULL AND g.event_id IS DISTINCT FROM p_event_id THEN
    RETURN jsonb_build_object(
      'result', 'wrong_event',
      'guest', jsonb_build_object('name', g.name, 'entered_at', g.entered_at)
    );
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
