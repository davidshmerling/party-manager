-- Twilio Content API — תבנית מאושרת לשליחת WhatsApp עסקי (Meta)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_content_sid text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_content_name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_content_status text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_content_category text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_content_submitted_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_twilio_placeholder_slots integer[];

COMMENT ON COLUMN public.events.whatsapp_twilio_content_sid IS 'Twilio Content SID (HX…) לאחר יצירה; לאחר אישור Meta — לשליחה עם ContentVariables';
COMMENT ON COLUMN public.events.whatsapp_twilio_content_name IS 'שם תבנית האישור ל‑WhatsApp (slug lowercase) שנשלח ל‑ApprovalRequests';
COMMENT ON COLUMN public.events.whatsapp_twilio_content_status IS 'סטטוס אחרון מתגובת Twilio/Meta (למשל received / pending)';
COMMENT ON COLUMN public.events.whatsapp_twilio_content_category IS 'קטגוריית התבנית: UTILITY או MARKETING';
COMMENT ON COLUMN public.events.whatsapp_twilio_placeholder_slots IS 'מספרי placeholders ב‑Twilio ({{1}},{{2}},…) לפי תבנית QR Party';
