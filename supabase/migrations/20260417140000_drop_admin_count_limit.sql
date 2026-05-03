-- הסרת הגבלת מספר אדמינים (אם הוחל גרסה קודמת עם טריגר)
DROP TRIGGER IF EXISTS profiles_max_three ON public.profiles;
DROP FUNCTION IF EXISTS public.enforce_max_three_admins();
