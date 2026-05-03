-- PostgREST חושף RPC לפי הרשאות התפקיד ב־JWT (anon / authenticated).
-- אם רק authenticated מקבל EXECUTE, לפעמים מתקבל 404/PGRST202 עד רענון cache,
-- או חוויית שגיאה מבלבלת כשהסשן פג.
-- הפונקציה בודקת auth.uid() ומחזירה JSON — אין דליפה ללא התחברות.
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pay_at_door_guest(uuid, text) TO service_role;
