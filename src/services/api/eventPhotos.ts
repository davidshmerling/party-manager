import type { EventPhotoRow } from '../../types/eventPhoto'
import { errMsg, sb } from './client'

const PARTY_PHOTOS_BUCKET = 'party-photos'

function sanitizeFileBase(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase()
  const safe = base.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'photo'
}

function inferExtension(file: File): string {
  const byName = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
  if (byName) return byName
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  if (file.type === 'image/svg+xml') return 'svg'
  return 'bin'
}

export function eventPhotoPublicUrl(storagePath: string): string {
  const path = storagePath.trim()
  if (!path) return ''
  const { data } = sb().storage.from(PARTY_PHOTOS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function fetchEventPhotos(
  eventId: string,
  opts?: { activeOnly?: boolean },
): Promise<EventPhotoRow[]> {
  let q = sb()
    .from('event_photos')
    .select('id,event_id,storage_path,alt_text,sort_order,is_active,created_at')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new Error(errMsg(error))
  return (data ?? []) as EventPhotoRow[]
}

export async function fetchActiveEventPhotoUrls(eventId: string): Promise<string[]> {
  const rows = await fetchEventPhotos(eventId, { activeOnly: true })
  return rows.map((row) => eventPhotoPublicUrl(row.storage_path)).filter(Boolean)
}

export async function fetchFirstActivePhotoUrlByEventIds(eventIds: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(eventIds.map((v) => v.trim()).filter(Boolean)))
  if (uniq.length === 0) return new Map()
  const { data, error } = await sb()
    .from('event_photos')
    .select('event_id,storage_path,sort_order,created_at')
    .in('event_id', uniq)
    .eq('is_active', true)
    .order('event_id', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(errMsg(error))
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const eventId = String((row as { event_id?: unknown }).event_id ?? '')
    if (!eventId || map.has(eventId)) continue
    const storagePath = String((row as { storage_path?: unknown }).storage_path ?? '').trim()
    if (!storagePath) continue
    map.set(eventId, eventPhotoPublicUrl(storagePath))
  }
  return map
}

export async function uploadEventPhoto(
  eventId: string,
  file: File,
  opts?: { altText?: string | null; sortOrder?: number; isActive?: boolean },
): Promise<EventPhotoRow> {
  const ts = Date.now()
  const ext = inferExtension(file)
  const base = sanitizeFileBase(file.name)
  const path = `events/${eventId}/${ts}-${base}.${ext}`

  const { error: uploadError } = await sb()
    .storage.from(PARTY_PHOTOS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (uploadError) throw new Error(errMsg(uploadError))

  const { data, error } = await sb()
    .from('event_photos')
    .insert({
      event_id: eventId,
      storage_path: path,
      alt_text: opts?.altText?.trim() || null,
      sort_order: Number.isFinite(opts?.sortOrder) ? opts?.sortOrder : 0,
      is_active: opts?.isActive ?? true,
    })
    .select('id,event_id,storage_path,alt_text,sort_order,is_active,created_at')
    .single()

  if (error) {
    await sb().storage.from(PARTY_PHOTOS_BUCKET).remove([path])
    throw new Error(errMsg(error))
  }
  return data as EventPhotoRow
}

export async function updateEventPhoto(
  photoId: string,
  patch: Partial<Pick<EventPhotoRow, 'alt_text' | 'sort_order' | 'is_active'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.alt_text !== undefined) payload.alt_text = patch.alt_text?.trim() || null
  if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order
  if (patch.is_active !== undefined) payload.is_active = patch.is_active
  if (Object.keys(payload).length === 0) return
  const { error } = await sb().from('event_photos').update(payload).eq('id', photoId)
  if (error) throw new Error(errMsg(error))
}

export async function deleteEventPhoto(photo: Pick<EventPhotoRow, 'id' | 'storage_path'>): Promise<void> {
  const { error: storageError } = await sb()
    .storage.from(PARTY_PHOTOS_BUCKET)
    .remove([photo.storage_path])
  if (storageError) throw new Error(errMsg(storageError))
  const { error } = await sb().from('event_photos').delete().eq('id', photo.id)
  if (error) throw new Error(errMsg(error))
}
