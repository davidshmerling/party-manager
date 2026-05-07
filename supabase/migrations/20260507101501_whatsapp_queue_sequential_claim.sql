-- אכיפת worker סדרתי לתור WhatsApp:
-- claim מחזיר לכל היותר הודעה אחת, ורק אם לא רצה claim מקביל באותו רגע.

CREATE OR REPLACE FUNCTION public.claim_whatsapp_send_queue_batch(p_limit int)
RETURNS SETOF public.whatsapp_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- מונע claim מקבילי של כמה workers באותה עת.
  IF NOT pg_try_advisory_xact_lock(915734201) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cte AS (
    SELECT sq.id
    FROM public.whatsapp_send_queue sq
    WHERE sq.status = 'pending'
      AND sq.send_after <= now()
    ORDER BY sq.send_after ASC, sq.created_at ASC
    LIMIT 1
    FOR UPDATE OF sq SKIP LOCKED
  )
  UPDATE public.whatsapp_send_queue q
  SET status = 'processing', updated_at = now()
  FROM cte
  WHERE q.id = cte.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_send_queue_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_send_queue_batch(int) TO service_role;

