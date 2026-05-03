import type {
  AdminPublicPartyRow,
  PublicPartyDetail,
  PublicPartyListRow,
  PublicPageStatus,
} from '../../types/publicParty'
import { sb, errMsg } from './client'

export async function fetchPublishedPartyPages(): Promise<PublicPartyListRow[]> {
  const { data, error } = await sb().rpc('list_public_party_pages')
  if (error) throw new Error(errMsg(error))
  return (data ?? []) as PublicPartyListRow[]
}

export async function fetchPublishedPartyPage(eventId: string): Promise<PublicPartyDetail | null> {
  const { data, error } = await sb().rpc('get_public_party_page', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null || (typeof data === 'object' && data !== null && Object.keys(data).length === 0)) {
    return null
  }
  return data as PublicPartyDetail
}

export async function fetchAdminPublicPartyPage(eventId: string): Promise<AdminPublicPartyRow | null> {
  const { data, error } = await sb().rpc('admin_get_event_public_page', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null) return null
  return data as AdminPublicPartyRow
}

export async function upsertAdminPublicPartyPage(
  eventId: string,
  body: {
    public_title: string | null
    public_description: string | null
    public_date: string | null
    public_location: string | null
    public_image_url: string | null
    paybox_url: string | null
    is_public: boolean
    public_status: PublicPageStatus
    public_what_included: string | null
    public_notes: string | null
    public_display_until: string | null
  },
): Promise<AdminPublicPartyRow | null> {
  const { data, error } = await sb().rpc('admin_upsert_event_public_page', {
    p_event_id: eventId,
    p_public_title: body.public_title,
    p_public_description: body.public_description,
    p_public_date: body.public_date,
    p_public_location: body.public_location,
    p_public_image_url: body.public_image_url,
    p_paybox_url: body.paybox_url,
    p_is_public: body.is_public,
    p_public_status: body.public_status,
    p_public_what_included: body.public_what_included,
    p_public_notes: body.public_notes,
    p_public_display_until: body.public_display_until,
  })
  if (error) throw new Error(errMsg(error))
  return data as AdminPublicPartyRow | null
}
