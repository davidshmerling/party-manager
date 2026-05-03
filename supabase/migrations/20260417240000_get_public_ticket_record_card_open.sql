-- סימון פתיחת דף כרטיס בקריאה ל-get_public_ticket (לא תלוי ב-RPC נפרד)
-- כך גם פרויקטים שלא הריצו/לא הצליחו record_guest_card_open עדיין יעדכנו card_opened_at

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

  UPDATE public.guests
  SET card_opened_at = now()
  WHERE unique_code = cleaned
    AND card_opened_at IS NULL;

  RETURN jsonb_build_object('name', v_name, 'code', v_code);
END;
$$;
