/** קישורי WhatsApp (אפליקציה / wa.me) והזמנה — ללא שרת חיצוני */

import { formatIsraelMobileE164, normalizePhoneForWa } from './formatIsraelMobileE164'

export { formatIsraelMobileE164, normalizePhoneForWa }

export function publicFrontendBase(): string {
  const v = import.meta.env.VITE_PUBLIC_FRONTEND_URL as string | undefined
  if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:5173'
}

/** שאילתה בכתובת הכרטיס — תצוגת אדמין בלי לרשום card_opened_at (רק קישור מניהול אורחים) */
export const GUEST_CARD_STAFF_PREVIEW_PARAM = 'staff_preview'

/** קישור ציבורי לכרטיס / QR — ‎/ticket/{opaque_code} */
export function buildGuestCardUrl(uniqueCode: string): string {
  const base = publicFrontendBase()
  const encoded = encodeURIComponent(uniqueCode)
  return `${base}/ticket/${encoded}`
}

/** קישור לכרטיס לפתיחה מהאדמין — לא מסמן «פתח דף» לאורח */
export function buildGuestCardStaffPreviewUrl(uniqueCode: string): string {
  const u = new URL(buildGuestCardUrl(uniqueCode))
  u.searchParams.set(GUEST_CARD_STAFF_PREVIEW_PARAM, '1')
  return u.toString()
}

/** תבנית ברירת מחדל — מציינים {name} ו־{link} (קישור יחיד); {event} אופציונלי בתבנית מותאמת */
export const DEFAULT_WHATSAPP_INVITE_TEMPLATE =
  'שלום {name},\nהכרטיס האישי שלך (ברקוד / QR):\n{link}\nשמור את הקישור להצגה בכניסה.'

/** קישור יחיד לדף הכרטיס — תמיד נלקח הראשון ברשימה (לממשק פנימי) */
export function formatWhatsAppInviteLink(cardUrls: string[]): string {
  const u = cardUrls.map((x) => x.trim()).filter(Boolean)
  return u[0] ?? ''
}

export function renderWhatsAppInvite(
  template: string | null | undefined,
  guestName: string,
  cardUrls: string[],
  eventName: string,
): string {
  const linkText = formatWhatsAppInviteLink(cardUrls)
  const t = template?.trim() ? template.trim() : DEFAULT_WHATSAPP_INVITE_TEMPLATE
  return t
    .replace(/\{name\}/g, guestName)
    .replace(/\{links\}/g, linkText)
    .replace(/\{link\}/g, linkText)
    .replace(/\{event\}/g, eventName)
}

export function buildInviteMessage(guestName: string, cardUrl: string, eventName: string): string {
  return renderWhatsAppInvite(null, guestName, [cardUrl], eventName)
}

/** קישור https — נוטה לפתוח WhatsApp Web בדפדפן שולחני */
export function buildWaMeUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForWa(phone)
  if (!normalized) throw new Error('מספר טלפון לא תקין לוואטסאפ')
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${normalized}?text=${encoded}`
}

/**
 * סכימת whatsapp:// — מעדיפה את אפליקציית WhatsApp (מחשב / מובייל) ולא את הווב.
 */
export function buildWhatsAppAppUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForWa(phone)
  if (!normalized) throw new Error('מספר טלפון לא תקין לוואטסאפ')
  const q = new URLSearchParams({ phone: normalized, text: message })
  return `whatsapp://send?${q.toString()}`
}

/** פתיחת קישור הזמנה — https בלשונית חדשה; whatsapp:// בלחיצת קישור (מעדיף אפליקציה) */
export function openWhatsAppInviteUrl(url: string): void {
  if (typeof window === 'undefined') return
  if (url.startsWith('whatsapp:')) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** כשאין `events.name` מה־DB — טקסט ל־{event}; לא נשען על משתני env */
export function eventNameFromEnv(): string {
  return 'האירוע'
}
