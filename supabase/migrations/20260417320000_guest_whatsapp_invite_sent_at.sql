-- מעקב אחר שליחת הזמנה בוואטסאפ (wa.me) — «שלח לכולם» רק למי שעדיין לא סומן

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS whatsapp_invite_sent_at timestamptz;

COMMENT ON COLUMN public.guests.whatsapp_invite_sent_at IS 'מועד סימון שהזמנה נשלחה בוואטסאפ; null = עדיין לא סומן';
