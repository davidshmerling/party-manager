import { useEffect } from 'react'
import { SITE_PARTY_BRAND } from '../config/sitePartyBrand'
import { publicImageBrand } from '../lib/publicAssetUrl'

function setOg(property: string, content: string) {
  let el = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setMetaName(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * כותרת דף + תגיות שיתוף (OG/Twitter). og:image עם כתובת מוחלטת לקישורי תצוגה מקדימה.
 */
export function useGuestCardDocumentMeta(opts: {
  guestName: string | null
  /** נטען כרטיס בהצלחה */
  ready: boolean
}) {
  const { guestName, ready } = opts

  useEffect(() => {
    const ogImage =
      typeof window !== 'undefined'
        ? `${window.location.origin}${publicImageBrand('og-cover.svg')}`
        : ''

    const titleBase = SITE_PARTY_BRAND.venueLine
    const title =
      ready && guestName ? `${guestName} · ${titleBase}` : `${titleBase} · כרטיס`
    document.title = title

    setOg('og:type', 'website')
    setOg('og:site_name', SITE_PARTY_BRAND.ogSiteName)
    setOg('og:title', title)
    setOg(
      'og:description',
      ready && guestName
        ? `כרטיס כניסה עבור ${guestName}. ${SITE_PARTY_BRAND.welcomeLine}`
        : SITE_PARTY_BRAND.ogDescriptionDefault,
    )
    setOg('og:image', ogImage)
    setOg('og:image:alt', SITE_PARTY_BRAND.ogCoverAlt)
    setOg('og:locale', 'he_IL')

    setMetaName('twitter:card', 'summary_large_image')
    setMetaName('twitter:title', title)
    setMetaName('twitter:image', ogImage)

    setMetaName('theme-color', '#e4e9f2')
  }, [guestName, ready])
}
