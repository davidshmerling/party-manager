-- קודים נוספים לאותו אורח (שם + טלפון מנורמל) לאירוע — לדפדוף בין ברקודים

CREATE OR REPLACE FUNCTION public.normalize_guest_phone_match(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  IF d LIKE '972%' THEN
    d := substring(d from 4);
    IF length(d) = 9 AND left(d, 1) = '5' THEN
      d := '0' || d;
    END IF;
  END IF;
  IF length(d) = 9 AND left(d, 1) = '5' THEN
    d := '0' || d;
  END IF;
  RETURN d;
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
  WHERE g.unique_code = cleaned
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
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  UPDATE public.guests
  SET card_opened_at = now()
  WHERE unique_code = cleaned
    AND card_opened_at IS NULL;

  RETURN jsonb_build_object(
    'name', v_name,
    'code', v_code,
    'card_text_above', v_above,
    'card_text_instruction', v_instruction,
    'card_text_below', v_below,
    'sibling_codes', v_siblings
  );
END;
$$;
