/**
 * מנרמל להדבקה בלבד — פלט אחיד: `+9725XXXXXXXX` (E.164 לנייד ישראלי).
 * השדה בממשק ממשיך להציג את מה שהמשתמש הזין; כאן רק מעתיקים פורמט בינלאומי אחיד.
 *
 * | קלט (אחרי סילוק לא-ספרות והרחבות) | פלט |
 * |-----------------------------------|-----|
 * | `+972 52-864-0111` / `972-52-864-0111` | `+972528640111` |
 * | `00972528640111` | `+972528640111` |
 * | `9720528640111` (13 ספרות, 0 מקומי אחרי 972) | `+972528640111` |
 * | `972543966264` (12) | `+972543966264` |
 * | `0543966264` (10) | `+972543966264` |
 * | `543966264` (9) | `+972543966264` |
 * | אחרת | `null` |
 */

function stripToIsraeliDigits(phone: string): string {
  let digits = String(phone ?? '').replace(/\D/g, '')
  for (let i = 0; i < 4 && digits.startsWith('00') && digits.length > 2; i++) {
    digits = digits.slice(2)
  }
  if (digits.length === 13 && digits.startsWith('9720') && digits[4] === '5') {
    digits = `972${digits.slice(4)}`
  }
  return digits
}

export function formatIsraelMobileE164(phone: string): string | null {
  const digits = stripToIsraeliDigits(phone)
  if (!digits) return null

  if (digits.length === 12 && digits.startsWith('972') && digits[3] === '5') {
    return `+${digits}`
  }

  if (digits.length === 10 && digits.startsWith('05')) {
    return `+972${digits.slice(1)}`
  }

  if (digits.length === 9 && digits.startsWith('5')) {
    return `+972${digits}`
  }

  return null
}

/** ל־wa.me / Twilio — ספרות `972…` בלי ‎+; אם אין זהות ישראלית תקפה — התנהגות כמו קודם (נשארות ספרות גולמיות אחרי ניקוי). */
export function normalizePhoneForWa(phone: string): string {
  const e164 = formatIsraelMobileE164(phone)
  if (e164) return e164.slice(1)
  const digits = stripToIsraeliDigits(phone)
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('05')) return `972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`
  return digits
}
