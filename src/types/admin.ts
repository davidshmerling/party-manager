export type AdminUserRow = {
  user_id: string
  email: string
  display_name: string
  /** role === 'admin' (אדמין מוגבל, לא שותף) */
  is_admin: boolean
  /** role === 'partner' */
  is_partner: boolean
  profile_role: string
}
