import type { MouseEvent } from 'react'

/** טוגל ×/✓ — אותו מבנה בדסקטוב ובמובייל: `guest-desk-pill-row` + `guest-desk-pill--entry-*` (פס אחד, לא שני «צ׳יפים» נפרדים) */
export type GuestBinaryStatusToggleProps = {
  noActive: boolean
  yesActive: boolean
  onNo: () => void
  onYes: () => void
  noLabel: string
  yesLabel: string
  noTitle: string
  yesTitle: string
  noAriaLabel: string
  yesAriaLabel: string
  groupAriaLabel: string
  /** במובייל — תווית מעל הפס (מחוץ ל־row כדי שלא יישבר ה־inline-flex) */
  mobileHint?: string
}

export function GuestBinaryStatusToggle({
  noActive,
  yesActive,
  onNo,
  onYes,
  noLabel,
  yesLabel,
  noTitle,
  yesTitle,
  noAriaLabel,
  yesAriaLabel,
  groupAriaLabel,
  mobileHint,
}: GuestBinaryStatusToggleProps) {
  const stop = (e: MouseEvent) => e.stopPropagation()

  const row = (
    <div className="guest-desk-pill-row" role="group" aria-label={groupAriaLabel}>
      <button
        type="button"
        className={`guest-desk-pill${noActive ? ' guest-desk-pill--on guest-desk-pill--entry-pending' : ''}`}
        onClick={(e) => {
          stop(e)
          void onNo()
        }}
        title={noTitle}
        aria-label={noAriaLabel}
      >
        {noLabel}
      </button>
      <button
        type="button"
        className={`guest-desk-pill${yesActive ? ' guest-desk-pill--on guest-desk-pill--entry-entered' : ''}`}
        onClick={(e) => {
          stop(e)
          void onYes()
        }}
        title={yesTitle}
        aria-label={yesAriaLabel}
      >
        {yesLabel}
      </button>
    </div>
  )

  if (mobileHint) {
    return (
      <div className="guest-mob-bool-block">
        <span className="guest-mob-bool-hint">{mobileHint}</span>
        {row}
      </div>
    )
  }

  return row
}
