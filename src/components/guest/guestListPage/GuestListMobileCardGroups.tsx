import { GuestGroupCard } from '../GuestGroupCard'
import type { GuestGroupRowProps } from '../useGuestGroupRowModel'
import type { IncomeRecipientEditOption } from '../IncomeRecipientSelect'
import type { Guest } from '../../../types/guest'
import { guestGroupKey } from '../../../utils/guestIdentity'
import { guestRowAnchorId } from '../../../utils/guestListSearch'

type IncomeMeta = {
  ids: string[]
  amount: number | null
  recipientLabel: string | null
  recipientSelectValue: string | null
}

type Props = {
  listGroups: Guest[][]
  doorGroups: Guest[][]
  listOffset: number
  searchFlashGroupKey: string | null
  focusedGroupKey: string | null
  onChange: GuestGroupRowProps['onChange']
  onDelete: GuestGroupRowProps['onDelete']
  onCopyWaMessage: GuestGroupRowProps['onCopyWaMessage']
  onSendTwilio?: GuestGroupRowProps['onSendTwilio']
  twilioTemplateApproved?: GuestGroupRowProps['twilioTemplateApproved']
  twilioSendingGuestId?: GuestGroupRowProps['twilioSendingGuestId']
  onCardPress: GuestGroupRowProps['onCardPress']
  onStatusCommitted: GuestGroupRowProps['onStatusCommitted']
  handleAddTicket: (members: Guest[]) => void | Promise<void>
  handleRemoveOneTicket: (members: Guest[]) => void | Promise<void>
  ticketActionKey: string | null
  incomeMetaForMembers: (members: Guest[]) => IncomeMeta
  incomeRecipientEditOptions: IncomeRecipientEditOption[]
  saveIncomeAmountForMembers: (members: Guest[], amount: number) => void | Promise<void>
  saveIncomeRecipientForMembers: (members: Guest[], recipientValue: string) => void | Promise<void>
  /** ‎profile.role === 'partner' — כרטיסים + סימון הזמנה ידני במצב «נצפה» */
  isPartner: boolean
}

export function GuestListMobileCardGroups({
  listGroups,
  doorGroups,
  listOffset,
  searchFlashGroupKey,
  focusedGroupKey,
  onChange,
  onDelete,
  onCopyWaMessage,
  onSendTwilio,
  twilioTemplateApproved,
  twilioSendingGuestId,
  onCardPress,
  onStatusCommitted,
  handleAddTicket,
  handleRemoveOneTicket,
  ticketActionKey,
  incomeMetaForMembers,
  incomeRecipientEditOptions,
  saveIncomeAmountForMembers,
  saveIncomeRecipientForMembers,
  isPartner,
}: Props) {
  return (
    <div className="guest-mob-list guest-list--mobile-only">
      {listGroups.map((members, index) => {
        const gk = guestGroupKey(members[0]!)
        const inc = incomeMetaForMembers(members)
        return (
          <GuestGroupCard
            key={gk}
            rowNum={index + 1}
            members={members}
            groupKey={gk}
            rowAnchorId={guestRowAnchorId(gk)}
            searchHighlight={searchFlashGroupKey === gk}
            isFocused={focusedGroupKey === gk}
            onChange={onChange}
            onDelete={onDelete}
            onCopyWaMessage={onCopyWaMessage}
            onSendTwilio={onSendTwilio}
            twilioTemplateApproved={twilioTemplateApproved}
            twilioSendingGuestId={twilioSendingGuestId}
            onCardPress={onCardPress}
            onStatusCommitted={onStatusCommitted}
            onAddTicket={isPartner ? () => void handleAddTicket(members) : undefined}
            onRemoveOneTicket={
              isPartner && members.length > 1 ? () => void handleRemoveOneTicket(members) : undefined
            }
            ticketActionPending={ticketActionKey === gk}
            isPartner={isPartner}
            incomeLineIds={inc.ids}
            incomeAmount={inc.amount}
            incomeRecipientLabel={inc.recipientLabel}
            incomeRecipientSelectValue={inc.recipientSelectValue}
            incomeRecipientEditOptions={incomeRecipientEditOptions}
            onSaveIncomeAmount={async (amt) => {
              await saveIncomeAmountForMembers(members, amt)
            }}
            onSaveIncomeRecipient={async (v) => {
              await saveIncomeRecipientForMembers(members, v)
            }}
          />
        )
      })}
      {doorGroups.length > 0 ? <h3 className="guest-list-subsection-title">תשלום בכניסה</h3> : null}
      {doorGroups.map((members, index) => {
        const gk = guestGroupKey(members[0]!)
        const inc = incomeMetaForMembers(members)
        return (
          <GuestGroupCard
            key={gk}
            rowNum={listOffset + index + 1}
            members={members}
            groupKey={gk}
            rowAnchorId={guestRowAnchorId(gk)}
            searchHighlight={searchFlashGroupKey === gk}
            isFocused={focusedGroupKey === gk}
            onChange={onChange}
            onDelete={onDelete}
            onCopyWaMessage={onCopyWaMessage}
            onSendTwilio={onSendTwilio}
            twilioTemplateApproved={twilioTemplateApproved}
            twilioSendingGuestId={twilioSendingGuestId}
            onCardPress={onCardPress}
            onStatusCommitted={onStatusCommitted}
            isPartner={isPartner}
            incomeLineIds={inc.ids}
            incomeAmount={inc.amount}
            incomeRecipientLabel={inc.recipientLabel}
            incomeRecipientSelectValue={inc.recipientSelectValue}
            incomeRecipientEditOptions={incomeRecipientEditOptions}
            onSaveIncomeAmount={async (amt) => {
              await saveIncomeAmountForMembers(members, amt)
            }}
            onSaveIncomeRecipient={async (v) => {
              await saveIncomeRecipientForMembers(members, v)
            }}
          />
        )
      })}
    </div>
  )
}
