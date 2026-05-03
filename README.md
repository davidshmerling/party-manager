# QR Party — כניסה לאירוע (MVP)

ניהול אורחים, QR, סריקה, הזמנה ב-`wa.me`. נתונים ב-**Supabase**; **אימות** דרך **Supabase Auth** + טבלת `profiles` ו-**event_staff** לשיוך סורקים לאירועים.

**מסמך מלא (מא׳ עד ת׳):** [`docs/מסמך-מערכת.md`](docs/מסמך-מערכת.md) — ארכיטקטורה, טבלאות, מיגרציות, RPC, נתיבים, זרימות ותקלות נפוצות.

## מבנה

- **שורש הפרויקט** — Vite + React (`package.json`, `src/`, `index.html`, `vite.config.ts`, `public/`)
- `supabase/migrations/` — סכימה, RLS, פונקציות RPC

## תפקידים

| תפקיד | `profiles.role` | גישה |
|--------|-----------------|------|
| **אדמין גלובלי** | `admin` | כל האירועים, יצירת אירועים, אורחים, סריקה, סטטיסטיקה, ניהול אדמינים/סורקים, שיוך צוות לאירוע |
| **סורק** | `scanner` | רק אירועים שמופיעים ב-`event_staff` עבור המשתמש — **סריקה** ו-**סטטיסטיקה מצטברת** (ללא רשימת אורחים) |

שיוך סורק לאירוע: אחרי **הגדר כסורק** בדף **אדמינים**, באירוע הנבחר → **צוות** → בחירת משתמש והוספה.

## הגדרת Supabase

1. **Authentication → Providers**: Email; **Enable Email signup** אם רוצים הרשמה מה-UI (`/login`).
2. משתמש חדש צריך שורה ב-`profiles` — **אדמין קיים** מגדיר דרך דף **אדמינים** (או SQL).
3. **SQL Editor** או `supabase db push`: להריץ את **כל** קבצי המיגרציה בסדר מתיקיית `supabase/migrations/` (לא רק את הקובץ הראשון). חשוב במיוחד:
   - **`20260417260000_event_staff_rbac_scan.sql`** — `event_staff`, `list_event_staff`, RLS, סריקה וכו'.
   - **`20260417280000_event_card_text.sql`** — עמודות `card_text_*` בטבלת `events` ועדכון `get_public_ticket` לכרטיס המותאם.
   - **`20260417350000_get_public_ticket_staff_preview.sql`** — גרסה ביניים (overload); אם הופיעה שגיאת schema cache, להריץ גם את **`20260417360000`**.
   - **`20260417360000_get_public_ticket_no_open_record.sql`** — `get_public_ticket_no_open_record` לתצוגת אדמין; משחזר `get_public_ticket(text)` ללקוח; מסיר overload `(text, boolean)`.
4. **Project Settings → API**: מפתח `anon` → `VITE_SUPABASE_ANON_KEY` ב-`.env`.

### שגיאות בדפדפן אחרי `git pull`

| תסמין | משמעות |
|--------|--------|
| `Could not find the 'card_text_above' column` / ‎`400` על `events?select=*` או ‎`PATCH` ל־`events` | המיגרציה **`20260417280000_event_card_text.sql`** לא הורצה על הפרויקט המרוחק. |
| `column events.whatsapp_invite_template does not exist` / ‎`400` על `events` | המיגרציה **`20260417300000_event_whatsapp_invite_template.sql`** (ועדיף את כל המיגרציות החדשות יותר) לא הורצה. הריצו `npm run db:push` או הדביקו את תוכן הקובץ ב־SQL Editor. |
| ‎`Could not find the function public.get_public_ticket(p_code, p_record_open)` / schema cache | להריץ **`20260417360000_get_public_ticket_no_open_record.sql`** (או `npm run db:push`). אחרי מיגרציה: לעיתים נדרש דקה עד ש-PostgREST ירענן מטמון — אפשר **Restart** לפרויקט ב-Supabase אם השגיאה נשארת. |
| ‎`404` על RPC ‎`list_event_staff` | המיגרציה **`20260417260000_event_staff_rbac_scan.sql`** (או חלק ממנה) לא הורצה. |

**פתרון (מומלץ — CLI):** ה־CLI מותקן בפרויקט (`devDependency` `supabase`). מהשורש:

```bash
npm install
npm run db:login
npm run db:link
```

ב־`db:link` יבקשו **Project ref** — מ־Supabase: **Project Settings → General → Reference ID**.

אחרי קישור מוצלח:

```bash
npm run db:push
```

(שקול ל־`npx supabase db push` מהשורש — אותו בינארי מ־`node_modules` אחרי `npm install`.)

זה מריץ את כל `supabase/migrations/` על הפרויקט המרוחק. לבדיקה: `npm run db:migrations`.

**חלופה:** **SQL Editor** בלוח הבקרה — להדביק ולהריץ לפי הסדר את תוכן קבצי ה־`.sql`. אחרי שינוי סכימה, לעיתים נדרש רענון קצר עד ש-PostgREST יעדכן מטמון.

## הוספת אדמין / סורק (ידני ב-SQL)

```sql
INSERT INTO public.profiles (id, email, display_name, role)
VALUES ('<uuid>', 'email@example.com', 'שם', 'admin');
-- או role = 'scanner' לסורק (ואז לשייך ב-event_staff דרך ה-UI)
```

## Frontend (מקומי)

```bash
npm install
cp .env.example .env
```

ערכו `.env` — לפחות `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY`.

```bash
npm run dev
```

## נתיבים (עדכני)

| נתיב | מי |
|------|-----|
| `/login` | התחברות; אדמין / סורק → `/`, בלי profile → `/not-authorized` |
| `/` | דף הבית — רשימת מסיבות (אדמין: יצירה/מחיקה; סורק: כניסה לסטט/סריקה) |
| `/events` | מפנה ל־`/` (תאימות קישורים ישנים) |
| `/events/:eventId/guests` | ניהול אורחים (**אדמין בלבד**) |
| `/events/:eventId/stats` | סטטיסטיקה (אדמין: מלא; סורק: סיכום ב-RPC בלבד) |
| `/events/:eventId/scan` | סריקה (אדמין + סורק) |
| `/events/:eventId/staff` | שיוך צוות / סורקים (**אדמין בלבד**) |
| `/admins` | ניהול משתמשים (**אדמין בלבד**) |
| `/ticket/:code` | ציבורי — כרטיס |

תאימות: נתיבים ישנים תחת **`/e/:eventId/...`** מופנים אוטומטית ל-**`/events/:eventId/...`**.

## סריקה אטומית (DB)

`process_guest_scan(p_code, p_event_id)`:

- בודקת הרשאה (`can_scan_event`) — לא מסתמכת על הפרונט.
- **Idempotent**: אם האורח כבר `entered` — מחזירה `already_checked_in` בלי לשנות שוב נתונים.
- עדכון `pending` → `entered` ב-**UPDATE** מותנה (`WHERE status = 'pending'`) + `FOR UPDATE` לסידור מרוצים.
- תשובות כוללות `status` / `result`, `message`, `guest_name`, `event_name` וכו'.

סטטיסטיקה לסורקים: RPC **`get_event_stats(p_event_id)`** — מספרים בלבד, בלי חשיפת טבלת `guests`.

## משתני סביבה

| משתנה | תיאור |
|--------|--------|
| `VITE_SUPABASE_URL` | כתובת הפרויקט |
| `VITE_SUPABASE_ANON_KEY` | מפתח anon |
| `VITE_PUBLIC_FRONTEND_URL` | בסיס לקישורי כרטיס (פרודקשן / לוקאלי) |

## אבטחה (קצר)

- **RLS** על `guests`: SELECT/מוטציה רק ל-`can_manage_event` (אדמין גלובלי / יוצר אירוע / אדמין אירוע ב-`event_staff`). **סורקים אינם** רואים את טבלת האורחים.
- **אירועים**: נראים רק אם אדמין גלובלי / יוצר / שיוך ב-`event_staff`.
- **כרטיס ציבורי**: `get_public_ticket` — רק שם + קוד.
- **סריקה**: `process_guest_scan` — `SECURITY DEFINER` + בדיקת הרשאה פנימית.
- אין secrets ב-`VITE_*`.

## QR

תוכן ה-QR: `https://…/ticket/{unique_code}`. `/guest/...` מופנה ל-`/ticket/...`.

## מיגרציה חדשה (סיכום)

**`20260417260000_event_staff_rbac_scan.sql`** — הרחבת `events`, `event_staff`, עדכון RLS, פונקציות `can_manage_event` / `can_scan_event`, סריקה מעודכנת, `get_event_stats`, ניהול צוות ב-RPC, `list_event_staff`, `promote_to_scanner`, עדכון `promote_to_admin` / `remove_admin` / `get_all_users_for_admin`.

**`20260417280000_event_card_text.sql`** — עמודות טקסט לכרטיס ציבורי ב־`events` ועדכון `get_public_ticket`.

לאחר משיכת הקוד: **`supabase db push`** (או הרצת הקבצים ב-SQL Editor) על אותו פרויקט Supabase שמוגדר ב־`.env`.
