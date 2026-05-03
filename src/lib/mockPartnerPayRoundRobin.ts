import { MOCK_PARTNER_ACQUIRERS } from '../constants/mockPartnerAcquirers'

const STORAGE_KEY = 'qr_party_mock_partner_pay_round'

/** קידום מונה ובחירת slug השותף הבא (מוק לפני נתוני רכישות אמיתיים). */
export function consumeNextMockPartnerSlug(): string {
  const slugs = MOCK_PARTNER_ACQUIRERS.map((p) => p.slug)
  if (slugs.length === 0) return 'unknown-partner'

  let raw = 0
  try {
    raw = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0
  } catch {
    raw = 0
  }

  const slug = slugs[((raw % slugs.length) + slugs.length) % slugs.length]
  try {
    sessionStorage.setItem(STORAGE_KEY, String(raw + 1))
  } catch {
    /* יכול להיכשל במצב פרטי */
  }
  return slug
}
