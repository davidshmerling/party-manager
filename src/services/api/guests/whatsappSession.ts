import { sb } from '../client'

export type TwilioBalanceResult = { balance: number; currency: string }

export async function fetchTwilioBalanceForEvent(eventId: string): Promise<TwilioBalanceResult> {
  const { data, error } = await sb().functions.invoke('twilio-balance', {
    body: { eventId },
  })
  const fallback = error?.message ?? 'שגיאת רשת'
  if (error) throw new Error(typeof data === 'object' && data && 'error' in data ? String((data as { error?: unknown }).error ?? fallback) : fallback)
  const d = data as { ok?: boolean; balance?: unknown; currency?: unknown } | null
  if (!d?.ok || typeof d.balance !== 'number' || !Number.isFinite(d.balance)) {
    throw new Error(fallback)
  }
  return {
    balance: d.balance,
    currency: typeof d.currency === 'string' && d.currency.trim() ? d.currency.trim() : 'USD',
  }
}
