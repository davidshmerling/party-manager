import { memo, useEffect, useState } from 'react'
import { GuestTicketStepper } from './GuestTicketStepper'
import { IncomeRecipientSelect } from './IncomeRecipientSelect'
import { GuestEntryMarkButton } from './GuestEntryMarkButton'
import { GuestInviteSentMarkButton } from './GuestInviteSentMarkButton'
import { GuestWhatsAppUnifiedControl } from './GuestWhatsAppUnifiedControl'
import { useGuestGroupRowModel, type GuestGroupRowProps } from './useGuestGroupRowModel'

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
    members,
    saveField,
    saveInviteSent,
    saveStatus,
  } = useGuestGroupRowModel(props)

  const [priceInput, setPriceInput] = useState('')
  useEffect(() => {
    if (incomeAmount != null && Number.isFinite(incomeAmount)) {
      setPriceInput(String(incomeAmount))
    } else {
      setPriceInput('')
    }
  }, [incomeAmount, groupKey])

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
          className="guest-desk-td guest-desk-td--entry-mark guest-desk-td--center"
          onClick={(e) => e.stopPropagation()}
        >
          <GuestEntryMarkButton variant="desk-col" members={members} saveStatus={saveStatus} />
        </td>
        <td
          className="guest-desk-td guest-desk-td--invite-mark guest-desk-td--center"
          onClick={(e) => e.stopPropagation()}
        >
          <GuestInviteSentMarkButton variant="desk-col" members={members} saveInviteSent={saveInviteSent} />
        </td>
        <td
          className="guest-desk-td guest-desk-td--actions"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guest-desk-actions guest-desk-actions--row" role="group" aria-label="פעולות שורה">
            <button
              type="button"
              className="guest-desk-act guest-desk-act--ico guest-desk-act--copy guest-desk-act--copy-wa"
              title="העתק הודעת WhatsApp"
              aria-label="העתק הודעת WhatsApp"
              onClick={() => void onCopyWaMessage(rep.id)}
            >
              <span className="guest-desk-act__emoji" aria-hidden>
                💬
              </span>
              <DeskIcoChat />
            </button>
            {onSendTwilio ? (
              <GuestWhatsAppUnifiedControl
                guestId={rep.id}
                phone={phone}
                source={payAtDoor ? 'pay_at_door' : 'list'}
                members={members}
                twilioTemplateApproved={twilioTemplateApproved}
                twilioSendingGuestId={twilioSendingGuestId}
                onSend={onSendTwilio}
                variant="desk"
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
