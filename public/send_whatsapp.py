#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
שליחת הזמנות WhatsApp — סריקה מקומית (Mac, Python 3)

נפתח **WhatsApp Web** בדפדפן (https://web.whatsapp.com/send).

הקוד קבוע; הנתונים בקובץ JSON נפרד (מיוצא מהאתר בכל «שלח הכל»).

זרימה מומלצת (קובץ ZIP בשם קבוע `qr-party-whatsapp.zip` בתיקיית המסמכים; subshell — חזרה אוטומטית ל־cwd הקודם):

  ( \\
    cd ~/Documents && \\
    [ -f qr-party-whatsapp.zip ] || { echo "❌ הקובץ לא נמצא במסמכים (~/Documents)"; exit 1; } && \\
    rm -rf qr-party-whatsapp && mkdir -p qr-party-whatsapp && \\
    unzip -o qr-party-whatsapp.zip -d qr-party-whatsapp && cd qr-party-whatsapp && \\
    python3 send_whatsapp.py data.json
  )

שימוש ידני:
  python3 send_whatsapp.py              # קורא data.json באותה תיקייה
  python3 send_whatsapp.py נתיב/לקובץ.json

בסוף ריצה מוצלחת: המתנה של 10 שניות, ואז — אם הרצתם מתוך תיקייה בשם `qr-party-whatsapp` נמחקים
תוכן התיקייה, התיקייה עצמה, וקובץ `qr-party-whatsapp.zip` בתיקייה שמעליה (בדרך כלל ~/Documents).
אחרת: מחיקת data.json והסקריפט בלבד. לביטול מחיקה: `WHATSAPP_KEEP_FILES=1`

מצב שליחה אוטומטית (לאחר שאלה בתחילת הריצה, אם בחרתם y):
  התקנה: pip3 install pyautogui
  ב־macOS: System Settings → Privacy & Security → Accessibility — להוסיף Terminal ו/או Python.
  לכל אורח: פתיחת WhatsApp Web, המתנה 5 שניות ועוד שנייה, לחיצת Enter (שליחה), המתנה 3 שניות, עדכון «נשלח» ב-Supabase, האורח הבא.
  לכל ריצה: לכל היותר 45 שליחות (האורחים הראשונים ב־data.json; להמשך — להריץ שוב).
  סיכונים: חלון לא בפוקוס / טעינה איטית — Enter עלול ללחוץ לא במקום או מוקדם מדי.

עדכון Supabase (אופציונלי): POST ל־Edge Function עם JWT של המשתמש (לא service_role).
  משתני סביבה: SUPABASE_URL, SUPABASE_ACCESS_TOKEN (Bearer), אופציונלי SUPABASE_ANON_KEY (כותרת apikey),
  WHATSAPP_MARK_SENT_FUNCTION (ברירת־מחדל: mark-whatsapp-invite-sent).
  pip install requests — מומלץ; בלי זה ייעשה שימוש ב־urllib.
  טעינת `.env`: pip install python-dotenv — נטען אוטומטית `.env` ליד הסקריפט ואז בתיקיית העבודה (אם אין חבילה — מתעלמים).

ברירת־מחדל של התבנית חייבת להישאר מסונכרנת עם:
  src/utils/whatsapp.ts — DEFAULT_WHATSAPP_INVITE_TEMPLATE
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment,misc]
else:
    _SCRIPT_DIR = Path(__file__).resolve().parent
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv()

_mark_supabase_warned = False

ZIP_BUNDLE_NAME = "qr-party-whatsapp.zip"

# מצב אוטומטי: לפני Enter — 5 שניות ואז עוד שנייה; אחרי Enter — המתנה ואז עדכון Supabase
AUTO_WAIT_BEFORE_SEND_SEC = 5.0
AUTO_WAIT_BEFORE_ENTER_EXTRA_SEC = 1.0
AUTO_WAIT_AFTER_SEND_SEC = 3.0

# לפני מחיקת ה־ZIP / תיקיית החילוץ / קבצי העבודה (אלא אם WHATSAPP_KEEP_FILES)
CLEANUP_DELAY_BEFORE_DELETE_SEC = 10.0

# מקסימום שליחות לריצה אחת (רק האורחים הראשונים בקובץ; הריצו שוב לשאר)
MAX_SENDS_PER_RUN = 45

DEFAULT_INVITE_TEMPLATE = (
    "שלום {name},\n"
    "הכרטיס האישי שלך (ברקוד / QR):\n"
    "{link}\n"
    "שמור את הקישור להצגה בכניסה."
)


def load_data(path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def normalize_phone(raw: str) -> Optional[str]:
    """מספר ישראלי לפורמט wa.me: 972… בלי פלוס. מחזיר None אם לא תקין."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return None

    if digits.startswith("972") and len(digits) in (11, 12):
        return digits

    if len(digits) == 10 and digits.startswith("05"):
        return "972" + digits[1:]

    if len(digits) == 9 and digits.startswith("5"):
        return "972" + digits

    return None


def render_message(template: str, name: str, link: str, event_name: str) -> str:
    return (
        template.replace("{name}", name)
        .replace("{links}", link)
        .replace("{link}", link)
        .replace("{event}", event_name)
    )


def build_whatsapp_url(phone: str, message: str) -> str:
    """wa.me — דפדפן / פלטפורמות שאין בהן סכימת whatsapp://."""
    n = normalize_phone(phone)
    if not n:
        raise ValueError("מספר טלפון לא תקין לאחר נירמול")
    encoded = urllib.parse.quote(message, safe="")
    return "https://wa.me/" + n + "?text=" + encoded


def build_whatsapp_web_url(phone: str, message: str) -> str:
    """WhatsApp Web בדפדפן."""
    n = normalize_phone(phone)
    if not n:
        raise ValueError("מספר טלפון לא תקין לאחר נירמול")
    encoded = urllib.parse.quote(message, safe="")
    return f"https://web.whatsapp.com/send?phone={n}&text={encoded}"


def build_whatsapp_app_url(phone: str, message: str) -> str:
    """whatsapp:// — אפליקציית WhatsApp למק (ללא דפדפן)."""
    n = normalize_phone(phone)
    if not n:
        raise ValueError("מספר טלפון לא תקין לאחר נירמול")
    q = urllib.parse.urlencode(
        {"phone": n, "text": message},
        quote_via=urllib.parse.quote,
    )
    return "whatsapp://send?" + q


def open_wa_url(url: str) -> None:
    """macOS: open עם https (למשל web.whatsapp.com) — לפי ה־URL שמועבר."""
    try:
        subprocess.run(["open", url], check=False)
    except OSError as e:
        print("שגיאה בפתיחת הקישור:", e, file=sys.stderr)


def try_import_pyautogui():
    """מיובא רק במצב אוטומטי; אם החבילה חסרה — מחזיר None."""
    try:
        import pyautogui  # type: ignore[import-untyped]

        return pyautogui
    except ImportError:
        return None


def get_supabase_mark_config() -> Optional[Tuple[str, str, Optional[str]]]:
    """URL מלא ל־Edge Function, JWT, ואופציונלי anon key לכותרת apikey."""
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not base or not token:
        return None
    fn = (os.environ.get("WHATSAPP_MARK_SENT_FUNCTION") or "mark-whatsapp-invite-sent").strip()
    if not fn:
        fn = "mark-whatsapp-invite-sent"
    anon = os.environ.get("SUPABASE_ANON_KEY", "").strip() or None
    return (f"{base}/functions/v1/{fn}", token, anon)


def _post_mark_sent_edge(
    function_url: str, token: str, anon_key: Optional[str], payload: Dict[str, Any]
) -> Tuple[int, str]:
    headers: Dict[str, str] = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if anon_key:
        headers["apikey"] = anon_key
    try:
        import requests  # type: ignore[import-untyped]

        r = requests.post(function_url, json=payload, headers=headers, timeout=45)
        text = (r.text or "")[:800]
        return r.status_code, text
    except ImportError:
        pass
    except Exception as e:
        return -1, str(e)

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(function_url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.status, (resp.read().decode("utf-8", errors="replace") or "")[:800]
    except urllib.error.HTTPError as e:
        body = (e.read().decode("utf-8", errors="replace") or "")[:800]
        return e.code, body
    except Exception as e:
        return -1, str(e)


def mark_sent(event_id: str, guest_id: str, name: str) -> None:
    """POST ל־Edge Function — eventId, guestId, method: local_script."""
    global _mark_supabase_warned
    cfg = get_supabase_mark_config()
    if not cfg:
        if not _mark_supabase_warned:
            print(
                "(אין SUPABASE_URL + SUPABASE_ACCESS_TOKEN — דילוג על עדכון Supabase)",
            )
            _mark_supabase_warned = True
        return

    function_url, token, anon_key = cfg
    payload = {
        "eventId": event_id,
        "guestId": guest_id,
        "method": "local_script",
    }
    status, body = _post_mark_sent_edge(function_url, token, anon_key, payload)
    if status == 200:
        print(f"    ✔️ סומן כנשלח: {name}")
    else:
        print(f"    שגיאת Supabase ({status}): {body}", file=sys.stderr)


def after_guest_mark_sent(data: Dict[str, Any], g: Dict[str, Any], name: str) -> None:
    eid = data.get("eventId")
    gid = g.get("guestId")
    if not eid or not gid:
        return
    mark_sent(str(eid), str(gid), name)


def prompt_auto_send_mode() -> bool:
    """שאלה אינטראקטיבית; בלי TTY — מצב ידני."""
    if not sys.stdin.isatty():
        print(
            "אין קלט אינטראקטיבי — מצב ידני (Enter בטרמינל בין אורחים).",
            file=sys.stderr,
        )
        return False
    while True:
        raw = input("אוטומטי? (y/n): ").strip().lower()
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no", ""):
            return False
        print("הקלידו y או n.")


def cleanup_bundle_after_run(data_path: str) -> None:
    """מחיקה מלאה אחרי זרימת Documents+ZIP, או מחיקת data+סקריפט בתיקייה אחרת."""
    if os.environ.get("WHATSAPP_KEEP_FILES", "").strip() in ("1", "true", "yes"):
        print("(WHATSAPP_KEEP_FILES — דילוג על מחיקה)")
        return

    print(
        f"⏳ ממתין {CLEANUP_DELAY_BEFORE_DELETE_SEC:g} שניות לפני מחיקת הקבצים…",
    )
    time.sleep(CLEANUP_DELAY_BEFORE_DELETE_SEC)

    script_path = Path(__file__).resolve()
    work_dir = script_path.parent

    if work_dir.name == "qr-party-whatsapp":
        parent = work_dir.parent
        zip_path = parent / ZIP_BUNDLE_NAME
        try:
            os.chdir(Path.home())
        except OSError as e:
            print("לא ניתן לעבור לתיקיית הבית לפני מחיקה:", e, file=sys.stderr)
            return
        try:
            if work_dir.is_dir():
                shutil.rmtree(work_dir)
                print("נמחקה תיקיית החילוץ:", work_dir)
        except OSError as e:
            print("לא נמחקה תיקיית החילוץ:", e, file=sys.stderr)
        try:
            if zip_path.is_file():
                zip_path.unlink()
                print("נמחק קובץ ה־ZIP:", zip_path)
        except OSError as e:
            print("לא נמחק קובץ ה־ZIP:", e, file=sys.stderr)
        return

    dp = Path(data_path).expanduser().resolve()
    try:
        if dp.is_file():
            dp.unlink()
            print("נמחק מהדיסק:", dp)
    except OSError as e:
        print("לא נמחק קובץ הנתונים:", e, file=sys.stderr)

    try:
        if script_path.is_file():
            script_path.unlink()
            print("נמחק מהדיסק:", script_path)
    except OSError as e:
        print("לא נמחק קובץ הסקריפט:", e, file=sys.stderr)


def main() -> None:
    data_path = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    try:
        data = load_data(data_path)
    except FileNotFoundError:
        print(f"לא נמצא קובץ נתונים: {data_path}", file=sys.stderr)
        sys.exit(2)
    event_name = str(data.get("eventName") or "האירוע")
    tmpl = data.get("inviteTemplate")
    invite_template = (
        DEFAULT_INVITE_TEMPLATE if not tmpl or not str(tmpl).strip() else str(tmpl)
    )

    all_guests: List[Dict[str, Any]] = list(data.get("guests") or [])
    n_in_file = len(all_guests)
    if n_in_file > MAX_SENDS_PER_RUN:
        print(
            f"הרשימה כוללת {n_in_file} אורחים; בפעם זו מבצעים {MAX_SENDS_PER_RUN} שליחות בלבד (לפי הסדר בקובץ). להמשך — להריץ שוב את הסקריפט.",
        )
    guests = all_guests[:MAX_SENDS_PER_RUN]
    total = len(guests)
    if total == 0:
        print("אין אורחים ברשימה.")
        cleanup_bundle_after_run(data_path)
        return

    print("סה״כ אורחים:", total)
    print("קובץ נתונים:", data_path)
    auto_send = prompt_auto_send_mode()
    pyautogui = try_import_pyautogui() if auto_send else None
    if auto_send and pyautogui is None:
        print(
            "חסרה חבילת pyautogui. הרצה: pip3 install pyautogui",
            file=sys.stderr,
        )
        sys.exit(1)
    if auto_send:
        print(
            "מצב אוטומטי: ודאו שחלון וואטסאפ בחזית ושהרשאות נגישות (Accessibility) מופעלות ל־Terminal/Python.",
        )
    print("—" * 40)

    for i, g in enumerate(guests, start=1):
        name = str(g.get("name") or "").strip() or "(ללא שם)"
        phone = str(g.get("phone") or "")
        link = str(g.get("link") or "").strip()
        remaining_after = total - i

        print()
        print(f"=== [{i}/{total}] עכשיו: {name} ===")
        print(f"    נשארו אחרי השורה הזו: {remaining_after}")

        if not link:
            print("    מדלגים: אין קישור כרטיס.", file=sys.stderr)
            continue

        normalized = normalize_phone(phone)
        if not normalized:
            print(f"    מדלגים ({name}): מספר טלפון לא תקין", file=sys.stderr)
            continue

        try:
            message = render_message(invite_template, name, link, event_name)
            url = build_whatsapp_web_url(phone, message)
        except ValueError as e:
            print(f"    מדלגים ({name}): {e}", file=sys.stderr)
            continue

        print(f"    מספר: {normalized}")
        print("    פותח WhatsApp Web…")
        open_wa_url(url)

        if auto_send:
            assert pyautogui is not None
            print(f"    ⏳ ממתין {AUTO_WAIT_BEFORE_SEND_SEC:g} שניות…")
            time.sleep(AUTO_WAIT_BEFORE_SEND_SEC)
            print(
                f"    ⏳ ממתין עוד {AUTO_WAIT_BEFORE_ENTER_EXTRA_SEC:g} שניות ואז Enter…",
            )
            time.sleep(AUTO_WAIT_BEFORE_ENTER_EXTRA_SEC)
            print("    ⌨️ שולח Enter…")
            pyautogui.press("enter")
            print(
                f"    ⏳ ממתין {AUTO_WAIT_AFTER_SEND_SEC:g} שניות אחרי Enter, ואז עדכון «נשלח»…",
            )
            time.sleep(AUTO_WAIT_AFTER_SEND_SEC)
            after_guest_mark_sent(data, g, name)
        else:
            time.sleep(1.5)
            if i < total:
                input("    לחצו Enter כדי להמשיך לאורח הבא… ")
            # אחרי Enter ידני: עדכון Supabase בסוף מחזור האורח
            after_guest_mark_sent(data, g, name)

    print()
    print("סיום.")
    cleanup_bundle_after_run(data_path)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nיציאה.", file=sys.stderr)
        sys.exit(130)
    except json.JSONDecodeError as e:
        print("שגיאה בפענוח הנתונים:", e, file=sys.stderr)
        sys.exit(1)
