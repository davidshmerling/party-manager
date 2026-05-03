-- טקסטים לכרטיס הציבורי (/ticket/...) לפי אירוע

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS card_text_above text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS card_text_instruction text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS card_text_below text;

COMMENT ON COLUMN public.events.card_text_above IS 'טקסט מעל שם האורח בכרטיס';
COMMENT ON COLUMN public.events.card_text_instruction IS 'משפט בין השם ל-QR (ברירת מחדל בפרונט אם ריק)';
COMMENT ON COLUMN public.events.card_text_below IS 'טקסט מתחת ל-QR';

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
  v_above text;
  v_instruction text;
  v_below text;
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

  SELECT g.name, g.unique_code, e.card_text_above, e.card_text_instruction, e.card_text_below
  INTO v_name, v_code, v_above, v_instruction, v_below
  FROM public.guests g
  INNER JOIN public.events e ON e.id = g.event_id
  WHERE g.unique_code = cleaned
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
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
    'card_text_below', v_below
  );
END;
$$;
