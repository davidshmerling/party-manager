import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { parseSiteMarketingRpc, resolveSiteMarketingPaths, type ResolvedSiteMarketing, type SiteMarketingRecord } from '../lib/siteMarketing'

/**
 * מטא־תמונות אתר (Supabase). null = עדיין טוען; אובייקט = אחרי fetch (אפשר ריק).
 */
export function useSiteMarketingAssets(): SiteMarketingRecord | null {
  const [raw, setRaw] = useState<SiteMarketingRecord | null>(null)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) {
      setRaw({ icon: null, about: null, hero: null, gallery: {} })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await sb.rpc('get_site_marketing_assets')
        if (cancelled) return
        if (error) throw error
        setRaw(parseSiteMarketingRpc(data))
      } catch {
        if (!cancelled) setRaw({ icon: null, about: null, hero: null, gallery: {} })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return raw
}

export function useResolvedSiteMarketing(): ResolvedSiteMarketing | null {
  const raw = useSiteMarketingAssets()
  return useMemo(() => (raw === null ? null : resolveSiteMarketingPaths(raw)), [raw])
}
