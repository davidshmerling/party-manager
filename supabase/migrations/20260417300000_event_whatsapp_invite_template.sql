-- תבנית הודעת wa.me לפי אירוע (מציינים: {name} {link} {event}; ריק = ברירת מחדל בקוד)

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS whatsapp_invite_template text;

COMMENT ON COLUMN public.events.whatsapp_invite_template IS 'תבנית הודעת wa.me — {name} {link} {event}; ריק = ברירת מחדל';
