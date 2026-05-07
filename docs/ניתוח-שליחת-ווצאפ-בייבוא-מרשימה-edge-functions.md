# ניתוח שליחת WhatsApp בייבוא מרשימה (Edge Functions)

## הארכיטקטורה הרצויה (היעד המעודכן)

`one invocation = one message = one source of truth`

- כל קריאה ל-`whatsapp-send-queue-worker` מעבדת הודעה אחת בלבד.
- אין לולאה, אין `sleep`, אין batch, ואין מקביליות עסקית בתוך אותה ריצה.
- התזמון מגיע מה-queue (`send_after`) ולא מה-worker.
- הודעה מסומנת `sent` רק אחרי הצלחה אמיתית מ-Twilio.
- אין חסימה גלובלית של התור: אם הודעה אחת נכשלה, ממשיכים לנסות הודעות אחרות לפי `send_after`.

## זרימה מלאה מקצה לקצה

1. `bulk-import-guests` יוצר רשומות לתור `whatsapp_send_queue`.
2. לכל רשומה נקבע `send_after` מצטבר: הודעה ראשונה בעוד 3–7 שניות, וכל הודעה נוספת +3–7 שניות אקראי.
3. Scheduler מפעיל את `whatsapp-send-queue-worker` כל ~10 שניות.
4. ה-worker מבצע claim להודעה אחת זמינה (`pending` + `send_after <= now()`).
5. ה-worker שולח ל-Twilio.
6. הצלחה: מעדכן `status='sent'` ושומר SID.
7. כשלון: מעדכן `pending`/`failed` עם `attempts`, `last_error`, ו-`send_after` חדש לניסיון חוזר.
8. הריצה מסתיימת.

## אינבריאנטים קריטיים (חובה)

- **No sent-before-success**: אסור לסמן `sent` לפני שיש תשובת הצלחה מ-Twilio.
- **Atomic per message**: כל invocation מטפל בהודעה אחת בלבד.
- **No global queue blocking**: כשלון של הודעה אחת לא חוסם את שאר התור.
- **Race-safe claim**: claim חייב להיות נעול לוגית:
  - `status = 'pending'`
  - `send_after <= now()`
  - `FOR UPDATE SKIP LOCKED`
  - advisory lock טרנזקציוני כדי לצמצם ריצות claim מקבילות.

## מה השתנה בפועל בקוד

- `supabase/functions/bulk-import-guests/index.ts`
  - תזמון ההודעות הוחלף מפיזור של ~דקה עד ~10 דקות לתזמון מצטבר של 3–7 שניות.
- `supabase/functions/whatsapp-send-queue-worker/index.ts`
  - claim מוגבל ליחידה אחת (`p_limit: 1`).
- `supabase/migrations/20260507101501_whatsapp_queue_sequential_claim.sql`
  - `claim_whatsapp_send_queue_batch` הוחלפה לגרסה סדרתית יותר:
    - `LIMIT 1`
    - `pg_try_advisory_xact_lock(...)`
    - `FOR UPDATE SKIP LOCKED`
- UI עודכן כדי לשקף פיזור של 3–7 שניות בין הודעות.

## תצורת Scheduler נדרשת

כדי שה-spacing יורגש בפועל, ה-worker חייב לרוץ בתדירות גבוהה מדקה.

- מומלץ: כל 10 שניות.
- אם ירוץ כל דקה, בפועל תישאר רזולוציה דקתית והקצב לא ייראה כמו 3–7 שניות.

## מדיניות סטטוסים ותצוגה (וי אפור / וי כחול)

- `sent` מתעדכן רק אחרי אישור הצלחה מ-Twilio (כלומר שליחה בוצעה באמת).
- "2 וי אפור" = ההודעה נשלחה ואושרה כסנט ב-Twilio (נמסר ליעד לפי ספק).
- "2 וי כחול" = המשתמש פתח את האתר / או התקבל עדכון מ-Twilio על שלב מתקדם יותר של מסירה/קריאה (לפי מה שממומש בפרויקט).
- לעולם לא מעדכנים "נשלח" לפני אישור ספק.

## בדיקות ולידציה אחרי פריסה

- לבדוק שההודעה הראשונה נשלחת בטווח קרוב ל-3–7 שניות מהייבוא.
- לבדוק שהודעות עוקבות נשמרות בפערים של 3–7 שניות (בממוצע, לפי tick של scheduler).
- לאמת שאין double send כשה-scheduler יורה קריאות חופפות.
- לאמת שבכשלון Twilio לא מתבצע `sent`, אלא `pending`/`failed` עם שגיאה וניסיון חוזר.
- לאמת שבכשלון מתמשך של הודעה אחת, שאר התור ממשיך להתקדם לפי `send_after`.

## שיפורים מומלצים להמשך

- להוסיף מנגנון שחרור הודעות שנתקעו ב-`processing` (timeout-based requeue).
- לשקול אינדקס מרוכב לביצועי polling:
  - `CREATE INDEX idx_whatsapp_queue_pending_send_after ON whatsapp_send_queue(status, send_after);`

## קבצים רלוונטיים

- `supabase/functions/bulk-import-guests/index.ts`
- `supabase/functions/whatsapp-send-queue-worker/index.ts`
- `supabase/migrations/20260504120000_whatsapp_send_queue.sql`
- `supabase/migrations/20260507101501_whatsapp_queue_sequential_claim.sql`
- `src/hooks/useGuestListPageModel.ts`
- `src/components/guest/guestListPage/GuestListPasteBulk.tsx`
