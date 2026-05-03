import type { EventRow } from '../../../types/event'

type Props = {
  currentEvent: EventRow | null
  listDisabled: boolean
}

export function GuestListPageHeader({ currentEvent, listDisabled }: Props) {
  return (
    <div className="guest-manage-hero">
      <div className="guest-manage-hero__text">
        <h1 className="guest-manage-hero__title">ניהול אורחים</h1>
        <p className="guest-manage-hero__subtitle">
          הוספה, חיפוש, סינון וניהול כניסות בזמן אמת
        </p>
        <p className="guest-manage-hero__event muted">
          {currentEvent ? (
            <>
              מסיבה: <strong>{currentEvent.name}</strong>
            </>
          ) : (
            'לא נבחרה מסיבה — חזרו לדף הבית.'
          )}
        </p>
      </div>
      <div className="guest-manage-hero__cta">
        <button
          type="button"
          className="btn btn-mob btn-mob--primary"
          disabled={listDisabled}
          onClick={() => document.getElementById('guest-add-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          הוסף אורח
        </button>
      </div>
    </div>
  )
}
