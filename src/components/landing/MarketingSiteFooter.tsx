import { Link } from 'react-router-dom'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'

type Props = {
  /** כשמשתמש מחובר — בלי כפתור (פינת צוות / יציאה) */
  showStaffLoginCta: boolean
}

export function MarketingSiteFooter({ showStaffLoginCta }: Props) {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-white/[0.07] bg-[linear-gradient(180deg,transparent,rgba(15,15,26,0.35))] px-4 py-8 text-center sm:px-6 md:py-10">
      {showStaffLoginCta ? (
        <div className="mx-auto mb-8 flex max-w-md flex-col items-center gap-2">
          <Link
            to="/login"
            className="touch-manipulation inline-flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.07] px-8 text-sm font-semibold text-white/90 shadow-[0_6px_24px_-10px_rgba(0,0,0,0.5)] transition hover:border-white/25 hover:bg-white/[0.11] hover:text-white active:scale-[0.99]"
          >
            {SITE_PARTY_BRAND.landingFooterLoginCta}
          </Link>
          <p className="font-sans text-xs text-white/45">{SITE_PARTY_BRAND.landingFooterLoginHint}</p>
        </div>
      ) : null}
      <p className="font-sans text-xs text-white/45">
        {SITE_PARTY_BRAND.venueLine} · {year}
      </p>
    </footer>
  )
}
