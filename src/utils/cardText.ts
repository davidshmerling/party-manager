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
