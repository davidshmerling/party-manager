export interface EventPhotoRow {
  id: string
  event_id: string
  storage_path: string
  alt_text: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}
