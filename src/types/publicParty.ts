/** תוצאות RPC למסיבות ציבוריות */
export interface PublicPartyListRow {
  event_id: string
  public_title: string | null
  public_description: string | null
  public_date: string | null
  public_location: string | null
  public_image_url: string | null
}

export interface PublicPartyDetail extends Record<string, unknown> {
  event_id: string
  public_title: string | null
  public_description: string | null
  public_date: string | null
  public_location: string | null
  public_image_url: string | null
  paybox_url: string | null
  public_what_included: string | null
  public_notes: string | null
}

export type PublicPageStatus = 'draft' | 'published' | 'closed'

export interface AdminPublicPartyRow {
  event_id: string
  event_name: string | null
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
  /** עד מתי להציג ברשימה ובפרטים; null = ללא הגבלה */
  public_display_until: string | null
}
