-- הודעות WhatsApp (Twilio) + מעקב סשן 24 שעות לאורח
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests (id) ON DELETE CASCADE,
  from_phone text NOT NULL,
  to_phone text NOT NULL,
  body text NOT NULL DEFAULT '',
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'queued',
  twilio_sid text,
  message_kind text NOT NULL DEFAULT 'session' CHECK (message_kind IN ('invite', 'session')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_event_guest_created
  ON public.whatsapp_messages (event_id, guest_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_event_created
  ON public.whatsapp_messages (event_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_twilio_sid_unique
  ON public.whatsapp_messages (twilio_sid)
  WHERE twilio_sid IS NOT NULL AND btrim(twilio_sid) <> '';

COMMENT ON TABLE public.whatsapp_messages IS 'הודעות WhatsApp דרך Twilio — נכנסות (webhook) ויוצאות (Edge); סטטוס מסונכרן מ-status callback';

CREATE OR REPLACE FUNCTION public.set_whatsapp_messages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_messages_set_updated_at ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_messages_set_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_whatsapp_messages_updated_at();

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_invite_twilio_sid text,
  ADD COLUMN IF NOT EXISTS whatsapp_invite_twilio_status text;

COMMENT ON COLUMN public.guests.whatsapp_last_inbound_at IS 'מועד ההודעה הנכנסת האחרונה מהלקוח (חלון 24 שעות לשליחת טקסט חופשי)';
COMMENT ON COLUMN public.guests.whatsapp_invite_twilio_sid IS 'SID של הודמת הזמנת הכרטיס האחרונה שנשלחה דרך Twilio';
COMMENT ON COLUMN public.guests.whatsapp_invite_twilio_status IS 'סטטוס Twilio להזמנה: queued, sent, delivered, read, failed, …';

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_messages_manage_select ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.can_manage_event((SELECT auth.uid()), event_id));

GRANT SELECT ON public.whatsapp_messages TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- התאמת מספר WhatsApp נכנס (From) לאורח — בחירה לפי הודעה יוצאת אחרונה לאותו מספר
CREATE OR REPLACE FUNCTION public.normalize_wa_phone_digits(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.guest_phone_match_variants(p_digits text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_digits IS NULL OR btrim(p_digits) = '' THEN ARRAY[]::text[]
    ELSE ARRAY(
      SELECT DISTINCT v
      FROM unnest(
        ARRAY[
          p_digits,
          CASE WHEN p_digits ~ '^972' AND length(p_digits) >= 11 THEN '0' || substring(p_digits from 4) END,
          CASE WHEN length(p_digits) = 9 AND substring(p_digits from 1 for 1) = '5' THEN '0' || p_digits END,
          CASE WHEN p_digits ~ '^0' THEN '972' || substring(p_digits from 2) END
        ]
      ) AS t(v)
      WHERE v IS NOT NULL AND btrim(v) <> ''
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.pick_guest_for_inbound_whatsapp(p_from_raw text)
RETURNS TABLE (guest_id uuid, event_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH from_d AS (
    SELECT public.normalize_wa_phone_digits(p_from_raw) AS d
  ),
  vars AS (
    SELECT unnest(public.guest_phone_match_variants((SELECT d FROM from_d))) AS phone_key
  ),
  cand AS (
    SELECT g.id, g.event_id,
           max(wm.created_at) FILTER (WHERE wm.direction = 'outbound') AS last_out
    FROM public.guests g
    LEFT JOIN public.whatsapp_messages wm ON wm.guest_id = g.id
    WHERE g.deleted_at IS NULL
      AND public.normalize_wa_phone_digits(g.phone) IN (
        SELECT public.normalize_wa_phone_digits(v.phone_key) FROM vars v
      )
    GROUP BY g.id, g.event_id
  )
  SELECT c.id AS guest_id, c.event_id
  FROM cand c
  ORDER BY coalesce(c.last_out, to_timestamp(0)) DESC, c.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.normalize_wa_phone_digits(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_phone_match_variants(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_guest_for_inbound_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_wa_phone_digits(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guest_phone_match_variants(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_guest_for_inbound_whatsapp(text) TO service_role;
