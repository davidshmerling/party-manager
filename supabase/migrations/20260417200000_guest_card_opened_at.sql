-- מעקב אחר פתיחה ראשונה של דף הכרטיס הציבורי (/ticket/...)

ALTER TABLE public.guests ADD COLUMN card_opened_at timestamptz;

COMMENT ON COLUMN public.guests.card_opened_at IS 'מועד פתיחה ראשונה של דף הכרטיס (קישור/QR) על ידי האורח';

CREATE OR REPLACE FUNCTION public.record_guest_card_open(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
BEGIN
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

REVOKE ALL ON FUNCTION public.record_guest_card_open(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_guest_card_open(text) TO anon, authenticated;
