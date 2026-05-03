import { Link } from 'react-router-dom'
import type { PublicPartyListRow } from '../../types/publicParty'
import { hideBrokenPublicImage, resetPublicImageVisibility } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'

function PublishedPartyCoverImage({
  eventId,
  publicImageUrl,
}: {
  eventId: string
  publicImageUrl: string | null | undefined
}) {
  const trimmed = publicImageUrl?.trim() ?? ''
  useDebugPublicImageSrc(`PublishedPartiesGrid:${eventId}`, trimmed || null)
  if (!trimmed) return null
  return (
    <img
      src={trimmed}
      alt=""
      className="relative z-10 h-full min-h-[140px] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      onError={hideBrokenPublicImage}
      onLoad={resetPublicImageVisibility}
      data-image-origin="published-party-card"
    />
  )
}

function hasCoverImage(publicImageUrl: string | null | undefined): boolean {
  return Boolean(publicImageUrl?.trim())
}

function excerpt(text: string | null | undefined, max = 140): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'תאריך ייעודי יפורסם בקרוב'
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
    return iso
  }
}

function formatBadgeDate(iso: string | null): string {
  if (!iso) return 'בקרוב'
  try {
    return new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso))
  } catch {
    return 'בקרוב'
  }
}

function attendeeBadgeText(eventId: string): string {
  const seed = Array.from(eventId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const base = 120 + (seed % 7) * 10
  return `${base}+ מגיעים`
}

export function PublishedPartiesGrid({ rows }: { rows: PublicPartyListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-14 text-center backdrop-blur-md">
        <p className="font-sans text-base text-white/75">אין מסיבות מפורסמות כרגע.</p>
        <p className="mt-2 font-sans text-sm text-white/48">חזרו בקרוב — נעדכן כשיהיה דבר ראשון.</p>
      </div>
    )
  }

  return (
    <ul className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 pt-8 sm:grid-cols-2 sm:gap-6 sm:px-6 lg:gap-7">
      {rows.map((row) => {
        const hasImage = hasCoverImage(row.public_image_url)
        return (
          <li key={row.event_id}>
            <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-violet-200/14 bg-white/[0.07] shadow-[0_18px_48px_-30px_rgba(0,0,0,0.72)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-indigo-300/45 hover:bg-white/[0.1] hover:shadow-[0_26px_58px_-30px_rgba(59,41,121,0.8)]">
              <Link
                to={`/parties/${row.event_id}`}
                className="flex min-h-0 flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <div
                  className={`relative h-52 overflow-hidden sm:h-60 ${
                    hasImage ? 'bg-zinc-950/25' : 'bg-gradient-to-br from-indigo-950/80 to-zinc-950'
                  }`}
                >
                  <PublishedPartyCoverImage eventId={row.event_id} publicImageUrl={row.public_image_url} />
                  <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
                    <span className="rounded-full border border-white/30 bg-black/35 px-3 py-1 text-[0.68rem] font-semibold text-white backdrop-blur-sm">
                      {formatBadgeDate(row.public_date)}
                    </span>
                    <span className="rounded-full border border-fuchsia-200/30 bg-fuchsia-500/18 px-3 py-1 text-[0.68rem] font-semibold text-fuchsia-100 backdrop-blur-sm">
                      {attendeeBadgeText(row.event_id)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3.5 px-5 pb-6 pt-5">
                  <h2 className="font-sans text-[1.13rem] font-bold leading-snug text-white">{row.public_title ?? 'מסיבה'}</h2>
                  <p className="font-sans text-xs font-medium uppercase tracking-wide text-indigo-200/85">
                    {formatWhen(row.public_date)}
                  </p>
                  {row.public_location ? (
                    <p className="font-sans text-sm text-white/58">{row.public_location}</p>
                  ) : null}
                  {row.public_description ? (
                    <p className="line-clamp-3 flex-1 font-sans text-sm leading-relaxed text-white/72">{excerpt(row.public_description)}</p>
                  ) : (
                    <p className="flex-1 font-sans text-sm text-white/42">פרטים נוספים בעמוד המסיבה.</p>
                  )}
                  <span className="mt-2 inline-flex min-w-[132px] items-center justify-center rounded-full bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition group-hover:from-indigo-500 group-hover:to-violet-500">
                    גלה פרטים
                  </span>
                </div>
              </Link>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
