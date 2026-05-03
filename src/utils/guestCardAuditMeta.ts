/** מידע אל־משתמשי לזיהוי בעת פתיחת כרטיס — נשמר ב־audit (דרך RPC) */

export function buildGuestCardClientAuditMeta(): Record<string, string> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {}
  }
  const out: Record<string, string> = {}
  const ua = navigator.userAgent?.trim()
  if (ua) out.user_agent = ua.slice(0, 920)
  if (navigator.language) out.language = navigator.language.slice(0, 64)
  try {
    out.page_url_path = `${window.location.pathname}${window.location.search}`.slice(0, 500)
    if (typeof document !== 'undefined' && document.referrer.trim()) {
      out.referrer = document.referrer.trim().slice(0, 520)
    }
  } catch {
    /* עקיפה בשגיאות Selenium / פרייבט */
  }
  return out
}
