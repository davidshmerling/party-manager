-- קישור ציבורי אחד לאורח (דף אחד); מאחורי הקלעים לכל כרטיס unique_code נפרד לסריקה

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS invite_bundle_code varchar(64);

UPDATE public.guests
SET invite_bundle_code = unique_code
WHERE invite_bundle_code IS NULL;

-- קבוצות זהות (שם+טלפון) עם יותר משורה אחת — קוד הזמנה משותף = unique_code של הרשומה הישנה ביותר
UPDATE public.guests g
SET invite_bundle_code = sub.first_uc
FROM (
  SELECT
    event_id,
    trim(lower(regexp_replace(name, '\s+', ' ', 'g'))) AS norm_name,
    public.normalize_guest_phone_match(phone) AS norm_phone,
    (array_agg(unique_code ORDER BY created_at, id))[1] AS first_uc
  FROM public.guests
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
) sub
WHERE g.event_id = sub.event_id
  AND trim(lower(regexp_replace(g.name, '\s+', ' ', 'g'))) = sub.norm_name
  AND public.normalize_guest_phone_match(g.phone) = sub.norm_phone
  AND sub.norm_phone <> '';

ALTER TABLE public.guests ALTER COLUMN invite_bundle_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guests_invite_bundle_code ON public.guests (invite_bundle_code);

COMMENT ON COLUMN public.guests.invite_bundle_code IS 'קוד לדף הכרטיס הציבורי (/ticket/...) — משותף לכל כרטיסי אותה זהות; unique_code נשאר לסריקה';

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
  uc text;
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
  WHERE g.unique_code = cleaned OR g.invite_bundle_code = cleaned
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

  UPDATE public.guests g3
  SET card_opened_at = now()
  WHERE g3.unique_code IN (SELECT jsonb_array_elements_text(v_siblings))
    AND g3.card_opened_at IS NULL;

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
  WHERE g.unique_code = cleaned OR g.invite_bundle_code = cleaned
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
      AND unique_code = cleaned;
    RETURN;
  END IF;

  UPDATE public.guests g2
  SET
    card_opened_at = COALESCE(g2.card_opened_at, now()),
    updated_at = CASE WHEN g2.card_opened_at IS NULL THEN now() ELSE g2.updated_at END
  WHERE g2.event_id = v_event_id
    AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
    AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
END;
$$;
