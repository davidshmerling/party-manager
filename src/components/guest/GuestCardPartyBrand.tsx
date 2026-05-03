import { useMemo } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { publicAppIcon, hideBrokenPublicImage } from '../../lib/publicAssetUrl'
import { useResolvedSiteMarketing } from '../../hooks/useSiteMarketingAssets'

/** סמל המקום + שורות — מעל כרטיס ה־QR או בראש דף ההתחברות */
export function GuestCardPartyBrand({ variant = 'ticket' }: { variant?: 'ticket' | 'login' }) {
  const marketing = useResolvedSiteMarketing()
  const logoUrl = useMemo(
    () => (marketing?.iconUrl?.trim() ? marketing.iconUrl.trim() : publicAppIcon()),
    [marketing?.iconUrl],
  )

  return (
    <header className="guest-card-party-brand">
      <img
        src={logoUrl}
        alt={SITE_PARTY_BRAND.logoAlt}
        className="guest-card-party-brand__logo relative z-0"
        decoding="async"
        onError={hideBrokenPublicImage}
      />
      <div className="guest-card-party-brand__text">
        <p className="guest-card-party-brand__venue">{SITE_PARTY_BRAND.venueLine}</p>
        {variant === 'ticket' ? (
          <p className="guest-card-party-brand__welcome">{SITE_PARTY_BRAND.welcomeLine}</p>
        ) : null}
      </div>
    </header>
  )
}
