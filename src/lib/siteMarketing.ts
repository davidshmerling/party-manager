import { isSupabaseConfigured } from './supabase'

export const SITE_MARKETING_BUCKET = 'site-marketing'

const GALLERY_ORDER = Array.from({ length: 99 }, (_, i) => `gallery-${String(i + 1).padStart(2, '0')}`)

export const SITE_GALLERY_SLOTS_ORDERED = GALLERY_ORDER

/** URL ציבורי לקובץ ב-bucket אתר */
export function siteMarketingPublicUrl(objectPath: string): string {
  const p = objectPath.replace(/^\/+/, '')
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
  if (!base) return ''
  return `${base}/storage/v1/object/public/${SITE_MARKETING_BUCKET}/${p}`
}

export type SiteMarketingRecord = {
  icon: string | null
  about: string | null
  hero: string | null
  /** נתיבי קבצים לפי slot (למשל gallery-01) */
  gallery: Record<string, string>
}

export type ResolvedSiteMarketing = {
  iconUrl: string | null
  aboutUrl: string | null
  heroUrl: string | null
  /** לפי סדר מספרי gallery-01 … */
  galleryUrls: string[]
}

function normalizeGalleryInput(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() && /^gallery-[0-9]{2}$/.test(k)) out[k] = v.trim()
    }
    return out
  }
  if (Array.isArray(raw)) {
    raw.forEach((path, i) => {
      if (typeof path === 'string' && path.trim()) {
        const slot = GALLERY_ORDER[i]
        if (slot) out[slot] = path.trim()
      }
    })
  }
  return out
}

export function parseSiteMarketingRpc(data: unknown): SiteMarketingRecord {
  if (!data || typeof data !== 'object') {
    return { icon: null, about: null, hero: null, gallery: {} }
  }
  const d = data as Record<string, unknown>
  return {
    icon: typeof d.icon === 'string' ? d.icon : null,
    about: typeof d.about === 'string' ? d.about : null,
    hero: typeof d.hero === 'string' ? d.hero : null,
    gallery: normalizeGalleryInput(d.gallery),
  }
}

export function resolveSiteMarketingPaths(raw: SiteMarketingRecord | null): ResolvedSiteMarketing {
  if (!raw || !isSupabaseConfigured) {
    return { iconUrl: null, aboutUrl: null, heroUrl: null, galleryUrls: [] }
  }
  const map = (p: string | null) => (p && p.trim() && isSupabaseConfigured ? siteMarketingPublicUrl(p.trim()) : null)
  const orderedGallerySlots = Object.keys(raw.gallery)
    .filter((slot) => /^gallery-[0-9]{2}$/.test(slot))
    .sort((a, b) => Number.parseInt(a.slice(8), 10) - Number.parseInt(b.slice(8), 10))

  const galleryUrls = orderedGallerySlots
    .map((slot) => raw.gallery[slot])
    .map((path) => (path && path.trim() ? siteMarketingPublicUrl(path.trim()) : null))
    .filter((x): x is string => Boolean(x))
  return {
    iconUrl: map(raw.icon),
    aboutUrl: map(raw.about),
    heroUrl: map(raw.hero),
    galleryUrls,
  }
}

/** חילוץ סיומת בטוחה מתוך שם קובץ / MIME */
export function safeImageExt(file: File): string {
  const fromName = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  const t = file.type
  if (t === 'image/jpeg') return 'jpg'
  if (t === 'image/png') return 'png'
  if (t === 'image/webp') return 'webp'
  if (t === 'image/gif') return 'gif'
  if (t === 'image/svg+xml') return 'svg'
  return 'webp'
}

export function objectPathForSlot(slot: string, file: File): string {
  const stamp = Date.now()
  const nonce = Math.random().toString(36).slice(2, 8)
  return `${slot}/${stamp}-${nonce}.${safeImageExt(file)}`
}
