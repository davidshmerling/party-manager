export type EventFinanceLineKind = 'income' | 'expense' | 'internal_transfer'

/** שיוך גורם לשורה (income/expense): paybox / partner / selector; ב־internal_transfer נשאר null */
export type IncomeRecipientKind = 'paybox' | 'partner' | 'selector'
export type TransferFromKind = 'paybox' | 'partner' | 'selector'

export type EventFinanceLine = {
  id: string
  event_id: string
  line_kind: EventFinanceLineKind
  /** שורת הכנסה מקושרת לכרטיס אורח; null = לא משויך או נתונים לפני השדה */
  guest_id: string | null
  person_name: string
  phone: string
  amount: number
  recipient_admin_id: string
  /** ‎internal_transfer‎: מעביר; אחרת ‎null */
  transfer_from_admin_id: string | null
  /** internal_transfer: מאפשר לסמן שמקור ההעברה הוא בריכת פייבוקס */
  transfer_from_kind: TransferFromKind | null
  /** income/expense: סוג גורם (למשל paybox); internal_transfer: null */
  income_recipient_kind: IncomeRecipientKind | null
  is_paid: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
