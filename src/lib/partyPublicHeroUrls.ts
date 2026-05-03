/** קאבר עמוד מסיבה: תמונת קאבר ישנה קודם, אחרת גלריית event_photos מ־Supabase. */
export function buildPublicPartyHeroUrls(
  publicImageUrl: string | null | undefined,
  eventPhotoUrls: string[] | null,
): string[] {
  const u = publicImageUrl?.trim()
  if (u) return [u]

  if (eventPhotoUrls === null) return []

  const out: string[] = []
  const seen = new Set<string>()
  for (const url of eventPhotoUrls) {
    const t = url.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 6) break
  }
  return out
}
