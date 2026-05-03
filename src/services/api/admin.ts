import type { AdminUserRow } from '../../types/admin'
import { sb, errMsg } from './client'
import { mapGlobalUserRow } from './mappers'

/** רשימה מלאה (דף «אדמינים») — רק לשותף */
export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await sb().rpc('get_all_users_for_admin')
  if (error) throw new Error(errMsg(error))
  const rows = Array.isArray(data) ? data : []
  return rows.map((raw) => mapGlobalUserRow(raw as Record<string, unknown>))
}

/** אורחים, שיוך סורק, וכו' — שותף או אדמין (רמה) */
export async function fetchGlobalStaffUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await sb().rpc('list_global_users_for_staff')
  if (error) throw new Error(errMsg(error))
  const rows = Array.isArray(data) ? data : []
  return rows.map((raw) => mapGlobalUserRow(raw as Record<string, unknown>))
}

export async function promoteToAdmin(userId: string): Promise<void> {
  const { error } = await sb().rpc('promote_to_admin', { p_user_id: userId })
  if (error) throw new Error(errMsg(error))
}

export async function promoteToPartner(userId: string): Promise<void> {
  const { error } = await sb().rpc('promote_to_partner', { p_user_id: userId })
  if (error) throw new Error(errMsg(error))
}

export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await sb().rpc('remove_admin', { p_user_id: userId })
  if (error) throw new Error(errMsg(error))
}

export async function adminSetUserDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await sb().rpc('admin_set_user_display_name', {
    p_user_id: userId,
    p_display_name: displayName.trim() ? displayName : '',
  })
  if (error) throw new Error(errMsg(error))
}
