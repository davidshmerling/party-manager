-- נשמר מ־Edge Function mark-whatsapp-invite-sent (payload.method מהסקריפט)
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS invite_sent_method text;

COMMENT ON COLUMN public.guests.invite_sent_method IS 'מקור סימון השליחה (למשל local_script)';
