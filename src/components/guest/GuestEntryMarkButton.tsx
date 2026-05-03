import { memo, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Guest, GuestStatus } from '../../types/guest'

export type EntrySegmentGroup = 'pending' | 'entered' | 'mixed'

function groupEntrySegment(members: Guest[]): EntrySegmentGroup {
  if (members.length === 0) return 'pending'
  const allP = members.every((m) => m.status === 'pending')
  const allE = members.every((m) => m.status === 'entered')
  if (allP) return 'pending'
  if (allE) return 'entered'
  return 'mixed'
}

function entryThumbVisual(groupSeg: EntrySegmentGroup, members: Guest[]): 'pending' | 'entered' {
  if (groupSeg !== 'mixed') return groupSeg
  return members.some((m) => m.status === 'pending') ? 'pending' : 'entered'
}

function thumbIndex(v: 'pending' | 'entered'): number {
  return v === 'pending' ? 0 : 1
}

function segmentTitle(groupSeg: EntrySegmentGroup, members: Guest[]): string {
  if (groupSeg === 'mixed') {
    const p = members.filter((m) => m.status === 'pending').length
    const e = members.filter((m) => m.status === 'entered').length
    return `מעורב: לא נכנס ${p}, נכנס ${e} — עדכון כניסה רק דרך סריקה`
  }
  if (groupSeg === 'pending') return 'לא נכנס — עדכון רק דרך סריקת QR בכניסה'
  return 'נכנס — עדכון רק דרך סריקה (אין ביטול ידני)'
}

export type GuestEntryMarkButtonProps = {
  variant: 'mob' | 'desk-col'
  members: Guest[]
  saveStatus: (next: GuestStatus) => Promise<void>
  /** כש־true (ברירת מחדל) — אין שינוי ידני; כניסה מתעדכנת רק בסריקה */
  readOnly?: boolean
}

export const GuestEntryMarkButton = memo(function GuestEntryMarkButton({
  variant,
  members,
  saveStatus,
  readOnly = true,
}: GuestEntryMarkButtonProps) {
  const [busy, setBusy] = useState(false)

  const groupSeg = useMemo(() => groupEntrySegment(members), [members])
  const thumbSeg = useMemo(() => entryThumbVisual(groupSeg, members), [groupSeg, members])

  const someEntered = useMemo(() => members.some((m) => m.status === 'entered'), [members])
  const somePending = useMemo(() => members.some((m) => m.status === 'pending'), [members])

  const title = segmentTitle(groupSeg, members)
  const idx = thumbIndex(thumbSeg)

  async function markPending(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (readOnly || busy || !someEntered) return
    setBusy(true)
    try {
      await saveStatus('pending')
    } finally {
      setBusy(false)
    }
  }

  async function markEntered(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (readOnly || busy || !somePending) return
    setBusy(true)
    try {
      await saveStatus('entered')
    } finally {
      setBusy(false)
    }
  }

  const rootClass =
    variant === 'desk-col'
      ? 'guest-entry-seg guest-entry-seg--desk-col'
      : 'guest-entry-seg guest-entry-seg--mob'

  return (
    <div
      className={`${rootClass} guest-entry-seg--thumb-${thumbSeg}${groupSeg === 'mixed' ? ' guest-entry-seg--mixed' : ''}${busy ? ' guest-entry-seg--busy' : ''}${readOnly ? ' guest-entry-seg--readonly' : ''}`}
      style={{ '--thumb': idx } as CSSProperties}
      role="group"
      title={title}
      aria-label={title}
    >
      <div className="guest-entry-seg__track">
        <div className="guest-entry-seg__thumb" aria-hidden />
        <button
          type="button"
          className="guest-entry-seg__cell guest-entry-seg__cell--tap"
          disabled={readOnly || busy || !someEntered}
          aria-label="סמן לא נכנס"
          onClick={(e) => void markPending(e)}
        >
          <span className="guest-entry-seg__glyph guest-entry-seg__glyph--not" aria-hidden>
            ✗
          </span>
        </button>
        <button
          type="button"
          className="guest-entry-seg__cell guest-entry-seg__cell--tap"
          disabled={readOnly || busy || !somePending}
          aria-label="סמן נכנס"
          onClick={(e) => void markEntered(e)}
        >
          <span className="guest-entry-seg__glyph guest-entry-seg__glyph--yes" aria-hidden>
            ✓
          </span>
        </button>
      </div>
    </div>
  )
})
