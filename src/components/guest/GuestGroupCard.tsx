import { memo, useEffect, useState } from 'react'
import { GuestListStatusBadge, guestStatusText } from './GuestListStatusBadge'
import { GuestBinaryStatusToggle } from './GuestBinaryStatusToggle'
import { statusTag, inviteMixedLabel } from './guestStatusTags'
import { GuestTicketStepper } from './GuestTicketStepper'
import { IncomeRecipientSelect } from './IncomeRecipientSelect'
import { GuestSendWhatsAppButton } from './GuestSendWhatsAppButton'
import { useGuestGroupRowModel, type GuestGroupRowProps } from './useGuestGroupRowModel'

export type { GuestGroupRowProps as GuestGroupCardProps }

function MobPrimarySvgPhone() {
  return (
    <svg className="guest-mob-primary-ico-svg" width={17} height={17} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V21a1 1 0 01-1 1C10.07 22 2 13.93 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.02l-2.21 2.2z" />
    </svg>
  )
}

function MobPrimarySvgChat() {
  return (
    <svg className="guest-mob-primary-ico-svg" width={17} height={17} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function MobPrimarySvgTrash() {
  return (
    <svg className="guest-mob-primary-ico-svg" width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </svg>
  )
}

function GuestGroupCardInner(props: GuestGroupRowProps) {
  const {
    rowNum,
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

  const payAtDoor = props.members[0]!.source === 'pay_at_door'

  const [priceInput, setPriceInput] = useState('')
  useEffect(() => {
    if (incomeAmount != null && Number.isFinite(incomeAmount)) {
      setPriceInput(String(incomeAmount))
    } else {
      setPriceInput('')
    }
  }, [incomeAmount, groupKey])

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
    members,
    saveField,
    saveStatus,
    saveCardOpened,
    saveInviteSent,
  } = useGuestGroupRowModel(props)

  const entryMixedGroup = entryMixed && multi
  const entryPendingOn = !entryMixedGroup && displayStatus === 'pending'
  const entryEnteredOn = !entryMixedGroup && displayStatus === 'entered'

  return (
    <article
      id={rowAnchorId}
      className={`guest-mob-card guest-mob-card--compact${searchHighlight ? ' guest-mob-card--search-flash' : ''}${isFocused ? ' guest-mob-card--focused' : ''}`}
      data-guest-group={groupKey}
    >
      {/* שורה 1: מספר (1.) + שם */}
      <div className="guest-mob-compact__r1">
        <div className="guest-mob-compact__r1-inner">
          <span className="guest-mob-compact__num" onClick={() => onCardPress(groupKey)} role="presentation">
            {rowNum}.
          </span>
          <input
            className="guest-mob-compact__name guest-mob-hero-name"
            value={name}
            placeholder="שם מלא"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveField('name', name)}
            onClick={(e) => e.stopPropagation()}
            aria-label="שם אורח"
          />
        </div>
      </div>

      {/* שורה 2: פלאפון + stepper כרטיסים */}
      <div className="guest-mob-compact__r2">
        {payAtDoor ? (
          <span className="guest-mob-compact__phone guest-mob-compact__phone--static muted" aria-label="מקור">
            תשלום בכניסה
          </span>
        ) : (
          <div className="guest-mob-compact__r2-line">
            <input
              className="guest-mob-compact__phone guest-mob-hero-phone"
              value={phone}
              placeholder="טלפון"
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => void saveField('phone', phone)}
              onClick={(e) => e.stopPropagation()}
              aria-label="מספר טלפון"
            />
            {onAddTicket ? (
              <GuestTicketStepper
                variant="mobile"
                count={members.length}
                canRemove={members.length > 1}
                disabled={ticketActionPending}
                onAdd={onAddTicket}
                onRemove={() => {
                  if (onRemoveOneTicket) void onRemoveOneTicket()
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="guest-mob-compact__r2 guest-mob-compact__r-price-pay" onClick={(e) => e.stopPropagation()}>
        {incomeLineIds.length > 0 && onSaveIncomeAmount ? (
          <>
            <span className="guest-mob-compact__hint muted guest-mob-compact__hint--inline">מחיר ‏(₪)</span>
            <input
              className="guest-mob-compact__name guest-mob-compact__price-input"
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
          </>
        ) : null}
        <span className="guest-mob-compact__hint muted guest-mob-compact__hint--inline">למי שולם</span>
        {incomeLineIds.length > 0 && onSaveIncomeRecipient ? (
          <IncomeRecipientSelect
            wrapClassName="guest-mob-compact__recipient"
            selectClassName="guest-mob-input guest-mob-compact__recipient-select event-finance-select"
            value={incomeRecipientSelectValue}
            options={incomeRecipientEditOptions ?? []}
            fallbackLabel={incomeRecipientLabel}
            aria-label="למי שולם"
            onCommit={onSaveIncomeRecipient}
          />
        ) : (
          <span className="guest-mob-compact__recipient" title={incomeRecipientLabel ?? undefined}>
            {incomeRecipientLabel ?? '—'}
          </span>
        )}
      </div>

      <div className="guest-mob-compact__r3 guest-mob-compact__r3--manage-strip" onClick={(e) => e.stopPropagation()}>
        <div
          className="guest-mob-compact__chips guest-mob-compact__chips--manage-strip"
          role="group"
          aria-label="כניסה, כרטיס, הזמנה ופעולות"
        >
          {entryMixedGroup ? (
            <div className="guest-mob-cpair guest-mob-cpair--badge" role="presentation">
              <span className="guest-mob-cpair__hint">כניסה</span>
              <GuestListStatusBadge
                allEntered={allEntered}
                entryMixed={entryMixed}
                enteredCount={enteredCount}
                total={members.length}
              />
            </div>
          ) : null}
          <GuestBinaryStatusToggle
            mobileHint={entryMixedGroup ? 'סנכרן' : 'כניסה'}
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
            groupAriaLabel="סטטוס כניסה"
          />
          <GuestBinaryStatusToggle
            mobileHint="כרטיס"
            noActive={!cardOpenAll}
            yesActive={cardOpenAll}
            onNo={() => void saveCardOpened('not_opened')}
            onYes={() => void saveCardOpened('opened')}
            noLabel={cardOpenMixed ? inviteMixedLabel(cardOpenedCount, members.length) : statusTag.enterNo}
            yesLabel={statusTag.enterYes}
            noTitle="לא נפתח דף"
            yesTitle="נפתח דף הכרטיס"
            noAriaLabel={
              cardOpenMixed
                ? `לא נפתח — ${inviteMixedLabel(cardOpenedCount, members.length)}`
                : 'לא נפתח דף הכרטיס'
            }
            yesAriaLabel="נפתח דף הכרטיס"
            groupAriaLabel="פתיחת דף כרטיס"
          />
          <GuestBinaryStatusToggle
            mobileHint="שליחת הזמנה"
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
          <button
            type="button"
            className="guest-mob-primary-ico guest-mob-primary-ico--phone"
            title="העתק מספר טלפון"
            aria-label="העתק מספר טלפון"
            onClick={(e) => {
              e.stopPropagation()
              void onCopyPhoneE164(rep.id)
            }}
          >
            <MobPrimarySvgPhone />
          </button>
          <button
            type="button"
            className="guest-mob-primary-ico guest-mob-primary-ico--copy"
            title="העתק הודעת WhatsApp"
            aria-label="העתק הודעת WhatsApp"
            onClick={(e) => {
              e.stopPropagation()
              void onCopyWaMessage(rep.id)
            }}
          >
            <MobPrimarySvgChat />
          </button>
          {onSendTwilio ? (
            <div className="guest-mob-primary-ico-wa">
              <GuestSendWhatsAppButton
                guestId={rep.id}
                phone={phone}
                source={payAtDoor ? 'pay_at_door' : 'list'}
                inviteAllSent={inviteAllSent}
                busy={twilioSendingGuestId === rep.id}
                onSend={onSendTwilio}
                twilioTemplateApproved={twilioTemplateApproved}
                variant="mob"
              />
            </div>
          ) : null}
          <button
            type="button"
            className="guest-mob-primary-ico guest-mob-primary-ico--del"
            title="הסר מהרשימה"
            aria-label="הסר מהרשימה"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(members.map((x) => x.id))
            }}
          >
            <MobPrimarySvgTrash />
          </button>
        </div>
      </div>
    </article>
  )
}

export const GuestGroupCard = memo(GuestGroupCardInner)
