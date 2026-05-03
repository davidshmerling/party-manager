import { useEffect, useState } from 'react'
import { PublishedPartiesGrid } from '../parties/PublishedPartiesGrid'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { LANDING_UPCOMING_PARTIES_ID } from '../../constants/appRoutes'
import { fetchFirstActivePhotoUrlByEventIds } from '../../services/api/eventPhotos'
import { fetchPublishedPartyPages } from '../../services/api/publicPartyPages'
import type { PublicPartyListRow } from '../../types/publicParty'

export function LandingPublishedPartiesSection() {
  const [rows, setRows] = useState<PublicPartyListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchPublishedPartyPages()
        const coverMap = await fetchFirstActivePhotoUrlByEventIds(list.map((row) => row.event_id))
        const merged = list.map((row) => ({
          ...row,
          public_image_url: coverMap.get(row.event_id) ?? row.public_image_url,
        }))
        if (!cancelled) setRows(merged)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section
      id={LANDING_UPCOMING_PARTIES_ID}
      className="scroll-mt-6 pb-6 pt-3 sm:scroll-mt-8 md:pb-8"
      aria-labelledby="landing-upcoming-parties-heading"
    >
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <h2
          id="landing-upcoming-parties-heading"
          className="font-sans text-2xl font-bold tracking-tight text-white sm:text-[2rem]"
        >
          המסיבות הבאות שלנו
        </h2>
        <p className="mx-auto mt-3 max-w-2xl font-sans text-sm leading-relaxed text-white/68 md:text-base">
          רשימת האירועים הפתוחים והקרובים · {SITE_PARTY_BRAND.venueLine}
        </p>
      </div>

      {err ? (
        <div className="mx-auto max-w-lg px-4 pb-12 pt-8 text-center">
          <p className="rounded-xl border border-red-400/35 bg-red-950/35 px-4 py-3 font-sans text-sm text-red-100">{err}</p>
        </div>
      ) : rows === null ? (
        <div className="flex justify-center pb-16 pt-10">
          <p className="font-sans text-sm text-white/55">טוען מסיבות…</p>
        </div>
      ) : (
        <PublishedPartiesGrid rows={rows} />
      )}
    </section>
  )
}
