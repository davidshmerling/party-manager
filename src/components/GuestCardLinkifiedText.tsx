import type { ReactNode } from 'react'
import LinkifyIt from 'linkify-it'

const linkify = new LinkifyIt()

/** זיהוי URL בטקסט חופשי (כולל domain בלי https://); מחזיר צמתים עם <a>. */
export function renderGuestCardLinkifiedText(text: string): ReactNode {
  const matches = linkify.match(text)
  if (!matches?.length) return text

  const parts: ReactNode[] = []
  let cursor = 0
  matches.forEach((m, mi) => {
    if (m.index > cursor) {
      parts.push(text.slice(cursor, m.index))
    }
    parts.push(
      <a
        key={`${m.index}-${mi}`}
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        className="guest-card-inline-link"
        dir="ltr"
      >
        {m.raw}
      </a>,
    )
    cursor = m.lastIndex
  })
  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>
}
