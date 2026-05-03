-- עדכון card_opened_at חייב לעבור גם כש-RLS חוסם עדכון ישירות;
-- set_config(row_security off) בתוך SECURITY DEFINER (בעלות postgres) מבטיח שהעדכון ירוץ.

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

  SELECT g.name, g.unique_code INTO v_name, v_code
  FROM public.guests g
  WHERE g.unique_code = cleaned
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.guests
  SET card_opened_at = now()
  WHERE unique_code = cleaned
    AND card_opened_at IS NULL;

  RETURN jsonb_build_object('name', v_name, 'code', v_code);
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

  UPDATE public.guests
  SET
    card_opened_at = COALESCE(card_opened_at, now()),
    updated_at = CASE WHEN card_opened_at IS NULL THEN now() ELSE updated_at END
  WHERE unique_code = cleaned;
END;
$$;
