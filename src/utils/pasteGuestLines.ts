/** נרמול ל־05XXXXXXXX לזיהוי כפילויות — גם לשורות ישנות */
export function normalizePhoneForDedup(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('972')) {
    d = d.slice(3)
    if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  }
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  return d
}

export type ParsedGuestBulkFinanceLine = {
  name: string
  phone: string
  adminToken: string
  amount: number
}

function normalizeBulkPhoneToken(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return t.slice(0, 64)
}

/**
 * שורה אחת = אורח + שורת הכנסה. מפרידים: רווח/טאב.
 * אין עמודת «שולם / לא שולם» — רק (שם — טלפון — למי — סכום). למשל:
 *   דוד כהן 972-543966264 דוד 50
 *   רחל לוי 972-523380978 פייבוקס 60
 *   יוסי 972-528123456 סלקטור 40
 */
export function parseGuestBulkFinanceLine(line: string): ParsedGuestBulkFinanceLine | null {
  const t = line.replace(/\t/g, ' ').trim()
  if (!t) return null

  const tokens = t.split(/\s+/).filter(Boolean)
  const n = tokens.length
  if (n < 4) return null

  const amountRaw = tokens[n - 1]!.replace(',', '.')
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount < 0) return null

  const admin = tokens[n - 2]!
  const phone = tokens[n - 3]!
  const name = tokens.slice(0, n - 3).join(' ')
  const phoneNorm = normalizeBulkPhoneToken(phone)
  const nameTrim = name.trim()
  if (!nameTrim || !phoneNorm || !admin.trim()) return null
  return {
    name: nameTrim,
    phone: phoneNorm,
    adminToken: admin.trim(),
    amount,
  }
}
