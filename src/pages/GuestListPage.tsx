import { MobileToast } from '../components/MobileToast'
import { GuestListAddGuestSection } from '../components/guest/guestListPage/GuestListAddGuestSection'
import { GuestListDesktopTableSection } from '../components/guest/guestListPage/GuestListDesktopTableSection'
import { GuestListEmptyState } from '../components/guest/guestListPage/GuestListEmptyState'
import { GuestListFooterSummary } from '../components/guest/guestListPage/GuestListFooterSummary'
import { GuestListMobileCardGroups } from '../components/guest/guestListPage/GuestListMobileCardGroups'
import { GuestListPageBanners } from '../components/guest/guestListPage/GuestListPageBanners'
import { GuestListPageHeader } from '../components/guest/guestListPage/GuestListPageHeader'
import { GuestListPasteBulk } from '../components/guest/guestListPage/GuestListPasteBulk'
import { GuestListSearchFilters } from '../components/guest/guestListPage/GuestListSearchFilters'
import { GuestWhatsAppChatSheet } from '../components/guest/GuestWhatsAppChatSheet'
import { useGuestListPageModel } from '../hooks/useGuestListPageModel'

export function GuestListPage() {
  const m = useGuestListPageModel()
  const listHasRows = m.searchFilteredGroups.length > 0

  return (
    <div className="page guest-manage-page guest-list-page--mobile">
      <div className="guest-manage-shell">
        <GuestListPageHeader currentEvent={m.currentEvent} listDisabled={m.listDisabled} />

        <GuestListPageBanners
          error={m.error}
          listNotice={m.listNotice}
          pasteMsg={m.pasteMsg}
          pasteErrorLog={m.pasteErrorLog}
        />

        <div className="guest-manage-card guest-manage-card--muted">
          <div className="guest-manage-tools-inner">
            <GuestListPasteBulk
              pasteText={m.pasteText}
              setPasteText={m.setPasteText}
              pasteSubmitting={m.pasteSubmitting}
              listDisabled={m.listDisabled}
              onPasteBulk={m.onPasteBulk}
            />
          </div>
        </div>

        <div className="guest-manage-card">
          <GuestListAddGuestSection
            newName={m.newName}
            setNewName={m.setNewName}
            newPhone={m.newPhone}
            setNewPhone={m.setNewPhone}
            newGuestRecipient={m.newGuestRecipient}
            setNewGuestRecipient={m.setNewGuestRecipient}
            partnerRecipientRows={m.partnerRecipientRows}
            scannerRecipientOptions={m.scannerRecipientOptions}
            payboxDelegateId={m.payboxDelegateId}
            adminLabel={m.adminLabel}
            newGuestPrice={m.newGuestPrice}
            setNewGuestPrice={m.setNewGuestPrice}
            listDisabled={m.listDisabled}
            onAdd={m.handleAdd}
          />
        </div>

        <section className="guest-list-section" aria-labelledby="guest-list-heading">
          <h2 id="guest-list-heading" className="guest-list-section-title">
            רשימת האורחים
          </h2>
          {m.listDataRefetching && (
            <p className="muted small" style={{ marginTop: '-0.25rem', marginBottom: '0.35rem' }} aria-live="polite">
              מעדכן רשימה…
            </p>
          )}
          <GuestListSearchFilters
            guestSearchQuery={m.guestSearchQuery}
            setGuestSearchQuery={m.setGuestSearchQuery}
            handleGuestSearch={m.handleGuestSearch}
            searchDisabled={m.searchDisabled}
            guestSortMode={m.guestSortMode}
            setGuestSortMode={m.setGuestSortMode}
            listDisabled={m.listDisabled}
            filterAdminId={m.filterAdminId}
            setFilterAdminId={m.setFilterAdminId}
            recipientFilterOptions={m.recipientFilterOptions}
            guestInviteFilter={m.guestInviteFilter}
            setGuestInviteFilter={m.setGuestInviteFilter}
            guestEntryFilter={m.guestEntryFilter}
            setGuestEntryFilter={m.setGuestEntryFilter}
            loading={m.loading}
            sortedGroupedRowsLength={m.sortedGroupedRows.length}
          />

          <div className="guest-list-below-filters">
            {m.loading || !listHasRows ? (
              <GuestListEmptyState
                loading={m.loading}
                isEmpty={!m.loading && !listHasRows}
                searchQuery={m.guestSearchQuery}
                guestInviteFilter={m.guestInviteFilter}
                guestEntryFilter={m.guestEntryFilter}
                sortedGroupedRowsLength={m.sortedGroupedRows.length}
                filterAdminId={m.filterAdminId}
                onClearFilters={m.clearGuestListFilters}
              />
            ) : (
              <>
                <GuestListMobileCardGroups
                  listGroups={m.listGroups}
                  doorGroups={m.doorGroups}
                  listOffset={m.listGroups.length}
                  searchFlashGroupKey={m.searchFlashGroupKey}
                  focusedGroupKey={m.focusedGroupKey}
                  onChange={m.persistGuestRows}
                  onDelete={m.rowDeleteGroup}
                  onCopyWaMessage={m.rowCopyWhatsAppMessage}
                  onSendTwilio={m.rowSendTwilio}
                  onOpenWaChat={m.openWaChat}
                  twilioTemplateApproved={m.twilioTemplateApproved}
                  twilioSendingGuestId={m.twilioSendingGuestId}
                  onCardPress={m.onGuestCardFocus}
                  onStatusCommitted={m.onStatusCommitted}
                  handleAddTicket={m.handleAddTicket}
                  handleRemoveOneTicket={m.handleRemoveOneTicket}
                  ticketActionKey={m.ticketActionKey}
                  incomeMetaForMembers={m.incomeMetaForMembers}
                  incomeRecipientEditOptions={m.incomeRecipientEditOptions}
                  saveIncomeAmountForMembers={m.saveIncomeAmountForMembers}
                  saveIncomeRecipientForMembers={m.saveIncomeRecipientForMembers}
                />
                <div className="guest-manage-card guest-manage-table-card">
                  <GuestListDesktopTableSection
                    listGroups={m.listGroups}
                    doorGroups={m.doorGroups}
                    searchFlashGroupKey={m.searchFlashGroupKey}
                    focusedGroupKey={m.focusedGroupKey}
                    onChange={m.persistGuestRows}
                    onDelete={m.rowDeleteGroup}
                    onCopyWaMessage={m.rowCopyWhatsAppMessage}
                    onSendTwilio={m.rowSendTwilio}
                    onOpenWaChat={m.openWaChat}
                    twilioTemplateApproved={m.twilioTemplateApproved}
                    twilioSendingGuestId={m.twilioSendingGuestId}
                    onCardPress={m.onGuestCardFocus}
                    handleAddTicket={m.handleAddTicket}
                    handleRemoveOneTicket={m.handleRemoveOneTicket}
                    ticketActionKey={m.ticketActionKey}
                    incomeMetaForMembers={m.incomeMetaForMembers}
                    incomeRecipientEditOptions={m.incomeRecipientEditOptions}
                    saveIncomeAmountForMembers={m.saveIncomeAmountForMembers}
                    saveIncomeRecipientForMembers={m.saveIncomeRecipientForMembers}
                  />
                </div>
              </>
            )}
          </div>

          <GuestListFooterSummary
            loading={m.loading}
            guestsLength={m.guests.length}
            searchFilteredCount={m.searchFilteredGroups.length}
            guestListTableSummary={m.guestListTableSummary}
            searchQuery={m.guestSearchQuery}
            filterAdminId={m.filterAdminId}
            guestInviteOpenTotals={m.guestInviteOpenTotals}
            guestEntrySnapshot={m.guestEntrySnapshot}
          />
        </section>
      </div>

      <MobileToast toast={m.mobileToast} onDismiss={() => m.setMobileToast(null)} />

      {m.currentEventId ? (
        <GuestWhatsAppChatSheet
          eventId={m.currentEventId}
          guestId={m.waChatGuestId}
          open={m.waChatGuestId != null}
          onClose={m.closeWaChat}
        />
      ) : null}
    </div>
  )
}
