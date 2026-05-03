-- תור שליחת הזמנות WhatsApp (אחרי ייבוא מרוכז) — עיבוד ע״י Edge worker + Cron
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  send_after timestamptz NOT NULL,
  last_error text,
  twilio_sid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_queue_pending_due
  ON public.whatsapp_send_queue (send_after ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_queue_event
  ON public.whatsapp_send_queue (event_id);

COMMENT ON TABLE public.whatsapp_send_queue IS
  'תור שליחת הזמנת WhatsApp (Twilio); נוצר ב-bulk-import, מעובד ב-worker';

-- רק שורת pending/processing אחת לכל אורח (ניסיונות חוזרים על אותה שורה)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_send_queue_guest_active_unique
  ON public.whatsapp_send_queue (guest_id)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.set_whatsapp_send_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_send_queue_set_updated_at ON public.whatsapp_send_queue;
CREATE TRIGGER whatsapp_send_queue_set_updated_at
  BEFORE UPDATE ON public.whatsapp_send_queue
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_whatsapp_send_queue_updated_at();

ALTER TABLE public.whatsapp_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_send_queue_select ON public.whatsapp_send_queue
  FOR SELECT TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY whatsapp_send_queue_insert ON public.whatsapp_send_queue
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), event_id));

CREATE POLICY whatsapp_send_queue_update ON public.whatsapp_send_queue
  FOR UPDATE TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id))
  WITH CHECK (public.can_manage_event((SELECT auth.uid()), event_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_send_queue TO authenticated;
GRANT ALL ON public.whatsapp_send_queue TO service_role;

-- נעילת batch ל-worker (service_role) — SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_whatsapp_send_queue_batch(p_limit int)
RETURNS SETOF public.whatsapp_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    p_limit := 20;
  END IF;
  RETURN QUERY
  WITH cte AS (
    SELECT sq.id
    FROM public.whatsapp_send_queue sq
    WHERE sq.status = 'pending'
      AND sq.send_after <= now()
    ORDER BY sq.send_after ASC, sq.created_at ASC
    LIMIT p_limit
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

NOTIFY pgrst, 'reload schema';

-- Cron (Dashboard או SQL): כל דקה POST ל־/functions/v1/whatsapp-send-queue-worker
-- עם ‎Authorization: Bearer <SERVICE_ROLE_KEY>‎ (verify_jwt=false ב־config.toml).
