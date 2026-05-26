/** מחרוזת ריקה / רווחים בלבד = כמו לא ממולא (כמו `trim` בשמירה ל-DB) */
export function normalizeCardTextField(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/** נקודה בלבד (או אחרי trim) = ביטול שורה — לא מוצגים, ולא ממלאים מברירת מחדל */
export function isCardTextLineSuppressed(v: string | null | undefined): boolean {
  if (v == null) return false
  return String(v).trim() === '.'
}

/** תנאי שימוש / צילום — ברירת מחדל כש־null או ריק ב־DB (עריכה בדף תצוגת כרטיס) */
export const DEFAULT_CARD_TEXT_TERMS = `האירוע מצולם 📸
בכניסה למסיבה הינך מאשר/ת שימוש בתמונות ובסרטונים מהאירוע לצורכי סושיאל ופרסום של ההפקה.`

/** טקסט לתצוגה: "." = הסתרה; ריק/null = הנוסח הנתמך */
export function resolveCardTermsDisplayText(v: string | null | undefined): string | null {
  if (isCardTextLineSuppressed(v)) return null
  const n = normalizeCardTextField(v)
  if (n == null) return DEFAULT_CARD_TEXT_TERMS
  return n
}
