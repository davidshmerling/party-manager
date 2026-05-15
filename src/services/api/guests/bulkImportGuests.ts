import type { BulkImportGuestsResult } from '../../../types/guest'
import { mapEventFinanceLine, mapGuestRow } from '../mappers'
import { sb } from '../client'

export async function bulkImportGuests(body: {
  text: string
  eventId: string
}): Promise<BulkImportGuestsResult> {
  const { data, error } = await sb().functions.invoke('bulk-import-guests', {
    body: { eventId: body.eventId, text: body.text },
  })
  const fallbackMsg = error?.message ?? 'שגיאת רשת'
  let msg = fallbackMsg
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e.trim()) msg = e.trim()
  }
  if (error) {
    throw new Error(msg)
  }
  const d = data as Record<string, unknown> | null
  if (!d || typeof d.added !== 'number') {
    throw new Error(msg !== fallbackMsg ? msg : 'תגובה לא צפויה מהשרת')
  }
  const rawGuests = Array.isArray(d.createdGuests) ? d.createdGuests : []
  const rawFin = Array.isArray(d.financeLinesCreated) ? d.financeLinesCreated : []
  return {
    ok: Boolean(d.ok),
    receivedLines: typeof d.receivedLines === 'number' ? d.receivedLines : 0,
    validWorkItems: typeof d.validWorkItems === 'number' ? d.validWorkItems : 0,
    added: d.added,
    skipped: typeof d.skipped === 'number' ? d.skipped : 0,
    skippedInvalidPhone:
      typeof d.skippedInvalidPhone === 'number' ? d.skippedInvalidPhone : 0,
    queuedForWhatsapp: typeof d.queuedForWhatsapp === 'number' ? d.queuedForWhatsapp : 0,
    errors: Array.isArray(d.errors) ? (d.errors as string[]) : [],
    createdGuests: (rawGuests as Record<string, unknown>[]).map((r) => mapGuestRow(r)),
    financeLinesCreated: (rawFin as Record<string, unknown>[]).map((r) => mapEventFinanceLine(r)),
  }
}
