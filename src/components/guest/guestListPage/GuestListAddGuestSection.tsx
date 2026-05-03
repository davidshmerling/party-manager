import type { AdminUserRow } from '../../../types/admin'
import { formatIsraelMobileE164 } from '../../../utils/formatIsraelMobileE164'

const RECIPIENT_PAYBOX = '__paybox__' as const

type ScannerOpt = { userId: string; label: string }

type Props = {
  newName: string
  setNewName: (v: string) => void
  newPhone: string
  setNewPhone: (v: string) => void
  newGuestRecipient: string
  setNewGuestRecipient: (v: string) => void
  partnerRecipientRows: AdminUserRow[]
  scannerRecipientOptions: ScannerOpt[]
  payboxDelegateId: string | null
  adminLabel: (a: AdminUserRow) => string
  newGuestPrice: string
  setNewGuestPrice: (v: string) => void
  listDisabled: boolean
  onAdd: () => void | Promise<void>
}

const SEL = '__sel__' as const

export function GuestListAddGuestSection({
  newName,
  setNewName,
  newPhone,
  setNewPhone,
  newGuestRecipient,
  setNewGuestRecipient,
  partnerRecipientRows,
  scannerRecipientOptions,
  payboxDelegateId,
  adminLabel,
  newGuestPrice,
  setNewGuestPrice,
  listDisabled,
  onAdd,
}: Props) {
  const canPickRecipient = partnerRecipientRows.length > 0 || scannerRecipientOptions.length > 0
  const canSubmitRecipient = Boolean(
    canPickRecipient && newGuestRecipient,
  )
  const phoneE164 = formatIsraelMobileE164(newPhone)
  const phoneShowError = newPhone.trim() !== '' && phoneE164 === null
  const phoneBlocksSubmit = phoneE164 === null
  return (
    <section className="guest-add-section" id="guest-add-panel" aria-labelledby="guest-add-heading">
      <div className="guest-add-surface">
        <h2 id="guest-add-heading" className="sheet-section-title">
          הוספת אורח
        </h2>
        <div className="guest-add-mob guest-add-form--one-row">
          <div className="guest-add-field">
            <span className="guest-mob-label">שם</span>
            <input
              className="guest-mob-input"
              placeholder="שם מלא"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={listDisabled}
            />
          </div>
          <div className="guest-add-field">
            <span className="guest-mob-label">מספר</span>
            <input
              className={`guest-mob-input${phoneShowError ? ' guest-mob-input--field-error' : ''}`}
              placeholder="טלפון"
              inputMode="tel"
              autoComplete="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              disabled={listDisabled}
              aria-invalid={phoneShowError}
              aria-describedby={phoneShowError ? 'guest-add-phone-error' : undefined}
            />
            {phoneShowError ? (
              <p id="guest-add-phone-error" className="guest-add-field__error" role="alert">
                נייד ישראלי בלבד (05… / 9725…)
              </p>
            ) : null}
          </div>
          <div className="guest-add-field">
            <span className="guest-mob-label">מקבל תשלום</span>
            <select
              className="guest-mob-input event-finance-select"
              value={newGuestRecipient}
              onChange={(e) => setNewGuestRecipient(e.target.value)}
              disabled={listDisabled || !canPickRecipient}
            >
              {canPickRecipient ? (
                <option value="" disabled hidden>
                  בחר מקבל תשלום
                </option>
              ) : (
                <option value="">אין שותפים/סלקטורים</option>
              )}
              {payboxDelegateId ? (
                <optgroup label="פייבוקס">
                  <option value={RECIPIENT_PAYBOX}>פייבוקס</option>
                </optgroup>
              ) : null}
              {partnerRecipientRows.length > 0 ? (
                <optgroup label="שותפים">
                  {partnerRecipientRows.map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      {adminLabel(a)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {scannerRecipientOptions.length > 0 ? (
                <optgroup label="סלקטורים">
                  {scannerRecipientOptions.map((s) => (
                    <option key={s.userId} value={`${SEL}${s.userId}`}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div className="guest-add-field guest-add-field--price">
            <span className="guest-mob-label">מחיר כרטיס</span>
            <input
              className="guest-mob-input"
              placeholder="מחיר כרטיס"
              inputMode="decimal"
              value={newGuestPrice}
              onChange={(e) => setNewGuestPrice(e.target.value)}
              disabled={listDisabled}
              aria-label="מחיר כרטיס בשקלים"
            />
          </div>
          <div className="guest-add-form__btn-wrap">
            <button
              type="button"
              className="btn btn-mob btn-mob--primary guest-add-mob__btn guest-add-mob__btn--primary guest-add-cta"
              disabled={listDisabled || !canSubmitRecipient || phoneBlocksSubmit}
              onClick={() => void onAdd()}
            >
              הוסף אורח
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
