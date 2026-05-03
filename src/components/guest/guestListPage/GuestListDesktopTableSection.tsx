import { GuestGroupTableRow } from '../GuestGroupTableRow'
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
  searchFlashGroupKey: string | null
  focusedGroupKey: string | null
  onChange: GuestGroupRowProps['onChange']
  onDelete: GuestGroupRowProps['onDelete']
  onCopyWaMessage: GuestGroupRowProps['onCopyWaMessage']
  onSendTwilio?: GuestGroupRowProps['onSendTwilio']
  twilioTemplateApproved?: GuestGroupRowProps['twilioTemplateApproved']
  twilioSendingGuestId?: GuestGroupRowProps['twilioSendingGuestId']
  onCardPress: GuestGroupRowProps['onCardPress']
  handleAddTicket: (members: Guest[]) => void | Promise<void>
  handleRemoveOneTicket: (members: Guest[]) => void | Promise<void>
  ticketActionKey: string | null
  incomeMetaForMembers: (members: Guest[]) => IncomeMeta
  incomeRecipientEditOptions: IncomeRecipientEditOption[]
  saveIncomeAmountForMembers: (members: Guest[], amount: number) => void | Promise<void>
  saveIncomeRecipientForMembers: (members: Guest[], recipientValue: string) => void | Promise<void>
}

const TABLE_COLS = 8

export function GuestListDesktopTableSection({
  listGroups,
  doorGroups,
  searchFlashGroupKey,
  focusedGroupKey,
  onChange,
  onDelete,
  onCopyWaMessage,
  onSendTwilio,
  twilioTemplateApproved,
  twilioSendingGuestId,
  onCardPress,
  handleAddTicket,
  handleRemoveOneTicket,
  ticketActionKey,
  incomeMetaForMembers,
  incomeRecipientEditOptions,
  saveIncomeAmountForMembers,
  saveIncomeRecipientForMembers,
}: Props) {
  return (
    <div className="guest-desk guest-list--desktop-only">
      <div className="sheet-wrap guest-desk-sheet-wrap">
        <table className="sheet guest-desk-table guest-list-guest-table">
          <colgroup>
            <col className="guest-desk-col guest-desk-col--name" />
            <col className="guest-desk-col guest-desk-col--phone" />
            <col className="guest-desk-col guest-desk-col--price" />
            <col className="guest-desk-col guest-desk-col--recipient" />
            <col className="guest-desk-col guest-desk-col--tickets" />
            <col className="guest-desk-col guest-desk-col--entry-mark" />
            <col className="guest-desk-col guest-desk-col--invite-mark" />
            <col className="guest-desk-col guest-desk-col--actions" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="guest-desk-th guest-desk-th--name">
                שם
              </th>
              <th scope="col" className="guest-desk-th guest-desk-th--phone">
                פלאפון
              </th>
              <th scope="col" className="guest-desk-th guest-desk-th--price">
                מחיר (₪)
              </th>
              <th scope="col" className="guest-desk-th guest-desk-th--recipient">
                למי שולם
              </th>
              <th scope="col" className="guest-desk-th guest-desk-th--tickets">
                כמות כרטיסים
              </th>
              <th
                scope="col"
                className="guest-desk-th guest-desk-th--entry-mark guest-desk-th--tag"
                title="סימון ידני: האם האורח נכנס לפארטי"
              >
                כניסה
              </th>
              <th
                scope="col"
                className="guest-desk-th guest-desk-th--invite-mark guest-desk-th--tag"
                title="סימון ידני: האם הזמנת WhatsApp נשלחה (מסתנכרן מהמסד)"
              >
                הזמנה
              </th>
              <th scope="col" className="guest-desk-th guest-desk-th--actions">
                פעולות
              </th>
            </tr>
          </thead>
          <tbody className="guest-desk-tbody">
            {listGroups.map((members, index) => {
              const gk = guestGroupKey(members[0]!)
              const inc = incomeMetaForMembers(members)
              return (
                <GuestGroupTableRow
                  key={gk}
                  rowNum={index + 1}
                  tableStripeIndex={index}
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
                  onAddTicket={() => void handleAddTicket(members)}
                  onRemoveOneTicket={
                    members.length > 1 ? () => void handleRemoveOneTicket(members) : undefined
                  }
                  ticketActionPending={ticketActionKey === gk}
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
            {doorGroups.length > 0 ? (
              <tr className="guest-desk-tr guest-desk-tr--subsection">
                <td className="guest-desk-td guest-desk-td--subsection" colSpan={TABLE_COLS}>
                  תשלום בכניסה
                </td>
              </tr>
            ) : null}
            {doorGroups.map((members, index) => {
              const gk = guestGroupKey(members[0]!)
              const rowIndex = listGroups.length + index
              const inc = incomeMetaForMembers(members)
              return (
                <GuestGroupTableRow
                  key={gk}
                  rowNum={rowIndex + 1}
                  tableStripeIndex={rowIndex}
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
