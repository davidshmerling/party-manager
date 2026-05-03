-- מחיר כרטיס ברירת מחדל לאירוע (הצעה בטופס הוספת אורח)
-- =============================================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS default_ticket_price numeric(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.events.default_ticket_price IS
  'מחיר כרטיס ברירת מחדל (₪) — מוצע בניהול אורחים ובניהול תצוגת הכרטיס';
