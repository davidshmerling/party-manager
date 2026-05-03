import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PartyPublicHeroCarousel } from '../../components/parties/PartyPublicHeroCarousel'
import { PartyMarketingShell } from '../../components/parties/PartyMarketingShell'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { LANDING_PATH, LANDING_UPCOMING_PARTIES_ID } from '../../constants/appRoutes'
import { UUID_RE } from '../../services/api/client'
import { buildPublicPartyHeroUrls } from '../../lib/partyPublicHeroUrls'
import { fetchActiveEventPhotoUrls } from '../../services/api/eventPhotos'
import { fetchPublishedPartyPage } from '../../services/api/publicPartyPages'
import type { PublicPartyDetail } from '../../types/publicParty'

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso ?? ''
  }
}

export function PartyPublicDetailPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<PublicPartyDetail | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!UUID_RE.test(eventId)) {
      navigate({ pathname: LANDING_PATH, hash: LANDING_UPCOMING_PARTIES_ID }, { replace: true })
    }
  }, [eventId, navigate])

  useEffect(() => {
    if (!UUID_RE.test(eventId)) return
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchPublishedPartyPage(eventId)
        if (!cancelled) {
          setDetail(d ?? null)
          if (d?.public_title) {
            document.title = `${d.public_title} · ${SITE_PARTY_BRAND.venueLine}`
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (!UUID_RE.test(eventId)) return null

  const title = detail?.public_title ?? 'מסיבה'

  return (
    <PartyMarketingShell>
      {detail === undefined && !err ? (
        <div className="flex justify-center pb-24 pt-16">
          <p className="font-sans text-sm text-violet-200/65">טוען…</p>
        </div>
      ) : err ? (
        <div className="mx-auto max-w-lg px-4 pb-16 pt-12 text-center">
          <p className="rounded-2xl border border-violet-200/15 bg-[#1e1b4b]/50 px-4 py-3 font-sans text-sm text-red-100 shadow-[0_0_32px_-8px_rgba(139,92,246,0.25)]">{err}</p>
          <Link to="/parties" className="mt-6 inline-block font-sans text-sm text-indigo-200 underline-offset-4 hover:underline">
            חזרה לרשימה
          </Link>
        </div>
      ) : detail === null ? (
        <div className="mx-auto max-w-lg px-4 pb-16 pt-12 text-center">
          <p className="font-sans text-base text-violet-100/88">המסיבה לא נמצאה או שאינה מפורסמת.</p>
          <Link
            to={{ pathname: LANDING_PATH, hash: LANDING_UPCOMING_PARTIES_ID }}
            className="mt-6 inline-block rounded-full bg-white/10 px-4 py-2 font-sans text-sm text-white hover:bg-white/16"
          >
            לכל המסיבות
          </Link>
        </div>
      ) : detail ? (
        <ArticleBody detail={detail} title={title} />
      ) : null}
    </PartyMarketingShell>
  )
}

function ArticleBody({ detail, title }: { detail: PublicPartyDetail; title: string }) {
  const [eventPhotoUrls, setEventPhotoUrls] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const urls = await fetchActiveEventPhotoUrls(detail.event_id)
        if (!cancelled) setEventPhotoUrls(urls)
      } catch {
        if (!cancelled) setEventPhotoUrls([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detail.event_id])

  const heroUrls = useMemo(
    () => buildPublicPartyHeroUrls(detail.public_image_url, eventPhotoUrls),
    [detail.public_image_url, eventPhotoUrls],
  )
  const showHero = true

  return (
        <article className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
          <div
            className="overflow-hidden rounded-2xl border border-violet-300/18 bg-white/[0.09] shadow-[0_0_0_1px_rgba(167,139,250,0.12),0_0_48px_-12px_rgba(139,92,246,0.35),0_28px_60px_-28px_rgba(30,27,75,0.65)] backdrop-blur-md"
          >
            {showHero ? (
              <div className="relative h-[clamp(200px,40vw,380px)] min-h-[200px] w-full shrink-0 overflow-hidden rounded-t-2xl bg-[#25204a] ring-1 ring-inset ring-violet-400/10 sm:h-[clamp(260px,34vw,460px)] sm:min-h-[260px]">
                {heroUrls.length > 0 ? (
                  <>
                    <PartyPublicHeroCarousel urls={heroUrls} />
                  </>
                ) : (
                  <>
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-[#2d2670] via-[#241d52] to-[#1e1b4b]"
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-[#1e1b4b]/45 via-transparent to-violet-400/10"
                      aria-hidden
                    />
                  </>
                )}
              </div>
            ) : null}
            <div className="space-y-6 px-5 py-8 sm:px-10 sm:py-10">
              <header className="space-y-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/85">
                  {SITE_PARTY_BRAND.venueLine}
                </p>
                <h1 className="font-sans text-2xl font-bold leading-tight text-white sm:text-3xl">{title}</h1>
                {detail.public_date ? (
                  <p className="font-sans text-sm text-indigo-100/85">{formatWhen(detail.public_date)}</p>
                ) : null}
                {detail.public_location ? (
                  <p className="font-sans text-sm text-white/65">{detail.public_location}</p>
                ) : null}
              </header>

              {detail.public_description ? (
                <section className="space-y-2">
                  <h2 className="font-sans text-base font-semibold text-white">על המסיבה</h2>
                  <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/78">{detail.public_description}</div>
                </section>
              ) : null}

              {detail.public_what_included ? (
                <section className="space-y-2 rounded-xl border border-violet-200/12 bg-white/[0.05] px-4 py-4">
                  <h2 className="font-sans text-base font-semibold text-emerald-100/95">מה כלול</h2>
                  <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/76">{detail.public_what_included}</div>
                </section>
              ) : null}

              {detail.public_notes ? (
                <section className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-950/25 px-4 py-4">
                  <h2 className="font-sans text-base font-semibold text-amber-100/95">חשוב לדעת</h2>
                  <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-amber-50/85">{detail.public_notes}</div>
                </section>
              ) : null}

              <footer className="border-t border-violet-200/12 pt-8">
                {detail.paybox_url && detail.paybox_url.trim() ? (
                  <a
                    href={detail.paybox_url.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 px-6 py-4 text-center font-sans text-base font-bold text-white shadow-xl shadow-emerald-950/45 transition hover:from-emerald-500 hover:to-teal-500 sm:text-lg"
                  >
                    תשלום בפייבוקס
                  </a>
                ) : (
                  <p className="text-center font-sans text-base font-medium text-white/62">ההרשמה תיפתח בקרוב</p>
                )}
              </footer>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              to={{ pathname: LANDING_PATH, hash: LANDING_UPCOMING_PARTIES_ID }}
              className="font-sans text-sm text-indigo-200 underline-offset-4 hover:text-white hover:underline"
            >
              חזרה לכל המסיבות
            </Link>
          </div>
        </article>
  )
}
