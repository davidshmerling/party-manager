import type { MouseEvent } from 'react'

type Props = {
  count: number
  canRemove: boolean
  disabled?: boolean
  onAdd: () => void
  onRemove: () => void
  variant: 'desk' | 'mobile'
}

/** [ − | n | + ] — קומפקטי, dir=ltr לסימטריית +/− */
export function GuestTicketStepper({ count, canRemove, disabled, onAdd, onRemove, variant }: Props) {
  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      className={`guest-ticket-stepper guest-ticket-stepper--${variant}`}
      role="group"
      aria-label={`מספר כרטיסים: ${count}`}
      dir="ltr"
      onClick={stop}
    >
      <button
        type="button"
        className="guest-ticket-stepper__btn"
        disabled={Boolean(disabled) || !canRemove}
        onClick={() => void onRemove()}
        title="הסר כרטיס"
        aria-label="הסר כרטיס"
      >
        −
      </button>
      <span className="guest-ticket-stepper__val" title="מספר כרטיסים" aria-hidden>
        {count}
      </span>
      <button
        type="button"
        className="guest-ticket-stepper__btn"
        disabled={Boolean(disabled)}
        onClick={() => void onAdd()}
        title="הוסף כרטיס"
        aria-label="הוסף כרטיס"
      >
        +
      </button>
    </div>
  )
}
