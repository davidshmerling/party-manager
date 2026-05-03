export type EventFinanceLineKind = 'income' | 'expense' | 'selector_payout'

/** נמען הכנסה: בריכת פייבוקס, שותף ישיר, או סלקטור (הוצאות: null) */
export type IncomeRecipientKind = 'paybox' | 'partner' | 'selector'

export type EventFinanceLine = {
  id: string
  event_id: string
  line_kind: EventFinanceLineKind
  person_name: string
  phone: string
  amount: number
  recipient_admin_id: string
  /** ‎selector_payout‎: סלקטור שממנו יצא הכסף; אחרת ‎null */
  transfer_from_admin_id: string | null
  /** שורות הכנסה בלבד; null/חסר בנתונים ישן = ייחסו ל־partner ב־UI */
  income_recipient_kind: IncomeRecipientKind | null
  is_paid: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
