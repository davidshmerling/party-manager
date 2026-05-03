import { memo, useEffect, useState } from 'react'
import { GuestListStatusBadge, guestStatusText } from './GuestListStatusBadge'
import { GuestBinaryStatusToggle } from './GuestBinaryStatusToggle'
import { statusTag, inviteMixedLabel } from './guestStatusTags'
import { GuestTicketStepper } from './GuestTicketStepper'
import { IncomeRecipientSelect } from './IncomeRecipientSelect'
import { GuestSendWhatsAppButton } from './GuestSendWhatsAppButton'
import { useGuestGroupRowModel, type GuestGroupRowProps } from './useGuestGroupRowModel'

function DeskIcoPhone() {
  return (
    <svg
      className="guest-desk-act__ico"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V21a1 1 0 01-1 1C10.07 22 2 13.93 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.02l-2.21 2.2z" />
    </svg>
  )
}

function DeskIcoChat() {
  return (
    <svg
      className="guest-desk-act__ico"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function DeskIcoTrash() {
  return (
    <svg
      className="guest-desk-act__ico"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </svg>
  )
}

function GuestGroupTableRowInner(props: GuestGroupRowProps) {
  const payAtDoor = props.members[0]!.source === 'pay_at_door'

  const {
    rowNum: _rowNum,
    tableStripeIndex = 0,
    groupKey,
    rowAnchorId,
    searchHighlight,
    isFocused,
    onDelete,
    onCopyWaMessage,
    onCopyPhoneE164,
    onSendTwilio,
    twilioTemplateApproved = true,
    twilioSendingGuestId = null,
    onCardPress,
    onAddTicket,
    onRemoveOneTicket,
    ticketActionPending = false,
    incomeLineIds = [],
    incomeAmount = null,
    incomeRecipientLabel = null,
    incomeRecipientSelectValue = null,
    incomeRecipientEditOptions = [],
    onSaveIncomeAmount,
    onSaveIncomeRecipient,
  } = props

  const {
    rep,
    name,
    setName,
    phone,
    setPhone,
    multi,
    allEntered,
    entryMixed,
    enteredCount,
    displayStatus,
    inviteAllSent,
    inviteMixed,
    cardOpenAll,
    cardOpenMixed,
    cardOpenedCount,
    inviteSentCount,
    saveField,
    saveStatus,
    saveCardOpened,
    saveInviteSent,
    members,
  } = useGuestGroupRowModel(props)

  const [priceInput, setPriceInput] = useState('')
  useEffect(() => {
    if (incomeAmount != null && Number.isFinite(incomeAmount)) {
      setPriceInput(String(incomeAmount))
    } else {
      setPriceInput('')
    }
  }, [incomeAmount, groupKey])

  const entryMixedGroup = entryMixed && multi
  const entryPendingOn = !entryMixedGroup && displayStatus === 'pending'
  const entryEnteredOn = !entryMixedGroup && displayStatus === 'entered'

  const rowClass = `guest-desk-tr${tableStripeIndex % 2 === 0 ? ' guest-desk-tr--stripe' : ''}${searchHighlight ? ' guest-desk-tr--search' : ''}${isFocused ? ' guest-desk-tr--focused' : ''}`

  return (
    <>
      <tr
        id={rowAnchorId}
        className={rowClass}
        data-guest-group={groupKey}
        onClick={() => onCardPress(groupKey)}
        role="row"
      >
        <td
          className="guest-desk-td guest-desk-td--name"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guest-desk-td--name-row">
            <input
              className="guest-desk-field guest-desk-field--name"
              value={name}
              placeholder="שם מלא"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveField('name', name)}
            />
          </div>
        </td>
        <td
          className="guest-desk-td guest-desk-td--phone"
          onClick={(e) => e.stopPropagation()}
        >
          {payAtDoor ? (
            <span className="guest-desk-field guest-desk-field--phone guest-desk-field--static muted" aria-label="מקור">
              תשלום בכניסה
            </span>
          ) : (
            <input
              className="guest-desk-field guest-desk-field--phone"
              value={phone}
              placeholder="טלפון"
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => void saveField('phone', phone)}
            />
          )}
        </td>
        <td
          className="guest-desk-td guest-desk-td--price"
          onClick={(e) => e.stopPropagation()}
        >
          {incomeLineIds.length > 0 && onSaveIncomeAmount ? (
            <input
              className="guest-desk-field guest-desk-field--phone"
              style={{ maxWidth: '5.5rem' }}
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={async () => {
                const raw = priceInput.trim().replace(',', '.')
                const n = raw === '' ? 0 : Number(raw)
                if (!Number.isFinite(n) || n < 0) {
                  setPriceInput(
                    incomeAmount != null && Number.isFinite(incomeAmount) ? String(incomeAmount) : '',
                  )
                  return
                }
                if (incomeAmount != null && Math.abs(n - incomeAmount) < 1e-9) return
                try {
                  await onSaveIncomeAmount(n)
                } catch {
                  setPriceInput(
                    incomeAmount != null && Number.isFinite(incomeAmount) ? String(incomeAmount) : '',
                  )
                }
              }}
              aria-label="מחיר כרטיס בשקלים"
            />
          ) : payAtDoor ? (
            <span className="muted small">—</span>
          ) : (
            <span className="muted small" title="אין שורת הכנסה">
              —
            </span>
          )}
        </td>
        <td
          className="guest-desk-td guest-desk-td--recipient"
          onClick={(e) => e.stopPropagation()}
        >
          {incomeLineIds.length > 0 && onSaveIncomeRecipient ? (
            <IncomeRecipientSelect
              wrapClassName="guest-desk-field guest-desk-field--static guest-desk-recipient"
              selectClassName="guest-desk-field guest-desk-field--recipient-select event-finance-select"
              value={incomeRecipientSelectValue}
              options={incomeRecipientEditOptions ?? []}
              fallbackLabel={incomeRecipientLabel}
              aria-label="למי שולם"
              onCommit={onSaveIncomeRecipient}
            />
          ) : (
            <span
              className="guest-desk-field guest-desk-field--static guest-desk-recipient"
              title={incomeRecipientLabel ?? undefined}
            >
              {incomeRecipientLabel ?? '—'}
            </span>
          )}
        </td>
        <td
          className="guest-desk-td guest-desk-td--tickets guest-desk-td--center"
          onClick={(e) => e.stopPropagation()}
        >
          {onAddTicket ? (
            <GuestTicketStepper
              variant="desk"
              count={members.length}
              canRemove={members.length > 1}
              disabled={ticketActionPending}
              onAdd={onAddTicket}
              onRemove={() => {
                if (onRemoveOneTicket) void onRemoveOneTicket()
              }}
            />
          ) : (
            <span className="guest-desk-tickets-readonly" title="מספר כרטיסים">
              {members.length}
            </span>
          )}
        </td>
        <td
          className="guest-desk-td guest-desk-td--status guest-desk-td--toggle guest-desk-td--center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guest-desk-td--status-inner">
            {entryMixedGroup ? (
              <GuestListStatusBadge
                allEntered={allEntered}
                entryMixed={entryMixed}
                enteredCount={enteredCount}
                total={members.length}
              />
            ) : null}
            <GuestBinaryStatusToggle
              noActive={entryPendingOn}
              yesActive={entryEnteredOn}
              onNo={() => void saveStatus('pending')}
              onYes={() => void saveStatus('entered')}
              noLabel={statusTag.enterNo}
              yesLabel={statusTag.enterYes}
              noTitle="סמן הכול: לא נכנס"
              yesTitle="סמן הכול: נכנס"
              noAriaLabel={guestStatusText.pending}
              yesAriaLabel={guestStatusText.entered}
              groupAriaLabel="סנכרון כניסה לכל הכרטיסים"
            />
          </div>
        </td>
        <td
          className="guest-desk-td guest-desk-td--center guest-desk-td--toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <GuestBinaryStatusToggle
            noActive={!cardOpenAll}
            yesActive={cardOpenAll}
            onNo={() => void saveCardOpened('not_opened')}
            onYes={() => void saveCardOpened('opened')}
            noLabel={cardOpenMixed ? inviteMixedLabel(cardOpenedCount, members.length) : statusTag.enterNo}
            yesLabel={statusTag.enterYes}
            noTitle="לא נפתח דף"
            yesTitle="נפתח דף"
            noAriaLabel={
              cardOpenMixed
                ? `לא נפתח — ${inviteMixedLabel(cardOpenedCount, members.length)}`
                : 'לא נפתח דף הכרטיס'
            }
            yesAriaLabel="נפתח דף הכרטיס"
            groupAriaLabel="פתח כרטיס"
          />
        </td>
        <td
          className="guest-desk-td guest-desk-td--center guest-desk-td--toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <GuestBinaryStatusToggle
            noActive={!inviteAllSent}
            yesActive={inviteAllSent}
            onNo={() => void saveInviteSent('not_sent')}
            onYes={() => void saveInviteSent('sent')}
            noLabel={inviteMixed ? inviteMixedLabel(inviteSentCount, members.length) : statusTag.enterNo}
            yesLabel={statusTag.enterYes}
            noTitle={inviteMixed ? 'חלק — לא לכולם נשלחה הזמנה' : 'לא נשלחה הזמנה'}
            yesTitle="הוזמן (וואטסאפ)"
            noAriaLabel={inviteMixed ? 'חלקי הזמנה' : 'לא נשלחה הזמנה'}
            yesAriaLabel="הוזמן"
            groupAriaLabel="שליחת הזמנה"
          />
        </td>
        <td
          className="guest-desk-td guest-desk-td--actions"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guest-desk-actions guest-desk-actions--row" role="group" aria-label="פעולות שורה">
            <button
              type="button"
              className="guest-desk-act guest-desk-act--ico guest-desk-act--copy"
              title="העתק מספר טלפון"
              aria-label="העתק מספר טלפון"
              onClick={() => void onCopyPhoneE164(rep.id)}
            >
              <DeskIcoPhone />
            </button>
            <button
              type="button"
              className="guest-desk-act guest-desk-act--ico guest-desk-act--copy"
              title="העתק הודעת WhatsApp"
              aria-label="העתק הודעת WhatsApp"
              onClick={() => void onCopyWaMessage(rep.id)}
            >
              <DeskIcoChat />
            </button>
            {onSendTwilio ? (
              <GuestSendWhatsAppButton
                guestId={rep.id}
                phone={phone}
                source={payAtDoor ? 'pay_at_door' : 'list'}
                inviteAllSent={inviteAllSent}
                busy={twilioSendingGuestId === rep.id}
                onSend={onSendTwilio}
                twilioTemplateApproved={twilioTemplateApproved}
                variant="desk"
                compact
              />
            ) : null}
            <button
              type="button"
              className="guest-desk-act guest-desk-act--ico guest-desk-act--del"
              title="הסר אורח"
              aria-label="הסר אורח"
              onClick={() => onDelete(members.map((x) => x.id))}
            >
              <DeskIcoTrash />
            </button>
          </div>
        </td>
      </tr>
    </>
  )
}

export const GuestGroupTableRow = memo(GuestGroupTableRowInner)
