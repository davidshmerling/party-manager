-- =============================================================================
-- אופטימיזציות ביצועים ל־DB — QR Party
-- =============================================================================
-- מטרה: אינדקסים שמתאימים לשאילתות הנפוצות (רשימת אורחים לפי אירוע, RLS,
-- שיוך צוות), הפחתת כפילות אינדקס, ועדכון סטטיסטיקות לתכנן PostgreSQL.
--
-- לאחר push: לוודא ב־Supabase → Database → Index Advisor / EXPLAIN ANALYZE לשאילתות כבדות.
-- =============================================================================

-- --- guests: טעינת רשימה לאירוע — .eq('event_id').order('name').order('created_at')
-- אינדקס מרוכב מכסה גם סינון לפי event_id בלבד (קידום שמאלי ב־B-tree).
CREATE INDEX IF NOT EXISTS idx_guests_event_name_created
  ON public.guests (event_id, name, created_at);

COMMENT ON INDEX public.idx_guests_event_name_created IS
  'רשימת אורחים ממוינת לפי שם ואז created_at — fetchGuests';

-- האינדקס הישן על event_id בלבד מיותר אחרי המרוכב; מחיקה מפחיתה עומס על INSERT/UPDATE.
DROP INDEX IF EXISTS public.idx_guests_event_id;

-- idx_guests_event_status (event_id, status) — נשאר לסטטיסטיקות / סינון לפי סטטוס

-- --- events: מדיניות RLS ושאילתות לפי יוצר (created_by = auth.uid())
CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON public.events (created_by)
  WHERE created_by IS NOT NULL;

COMMENT ON INDEX public.idx_events_created_by IS
  'זיהוי מהיר של אירועים לפי יוצר — RLS / מחיקה';

-- --- event_staff: חיפוש שיוכים לפי משתמש (רשימת אירועים לסורק וכו׳)
CREATE INDEX IF NOT EXISTS idx_event_staff_user_event
  ON public.event_staff (user_id, event_id);

COMMENT ON INDEX public.idx_event_staff_user_event IS
  'שאילתות לפי user_id עם event_id — מדיניות גישה ו־JOIN';

-- עדכון סטטיסטיקות לתכנן (חשוב אחרי יצירת אינדקסים / ייבוא נתונים גדול)
ANALYZE public.guests;
ANALYZE public.events;
ANALYZE public.event_staff;
ANALYZE public.profiles;

-- =============================================================================
-- המלצות נוספות (יישום באפליקציה / תפעול — לא חלק מהמיגרציה)
-- =============================================================================
-- • אירוע עם אלפי אורחים: לשקול RPC עם LIMIT/OFFSET או keyset pagination במקום select('*')
--   על כל האורחים בקריאה אחת.
-- • אחרי ייבוא מאסיבי מחוץ למיגרציה: הרצת ANALYZE על guests שוב או להסתמך על autovacuum.
-- • ב־Supabase: מעקב אחרי שאילתות איטיות ב־Logs → Postgres Logs / Query Performance.
-- =============================================================================
