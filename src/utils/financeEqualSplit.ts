/** עיגול אגורות לחישובי חלוקה */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type PartnerNet = { id: string; label: string; net: number }

export type EqualSplitResult = {
  fairShare: number
  perPartner: { id: string; label: string; net: number; diffFromFair: number }[]
  equalizingTransfers: { fromLabel: string; toLabel: string; amount: number }[]
  transferCount: number
}

/** בריכת פייבוקס בהוראות איזון — תווית קבועה */
export const EQUAL_SPLIT_PAYBOX_LABEL = 'פייבוקס'

export type PoolPayer = { label: string; amount: number }

/**
 * מחלק את מצטבר המאזן (רווח נקי) שווה בין שותפים, ומחשב הערת פעולה מינימלית:
 * כמה העברות יש לבצע — כולל מ־פייבוקס / סלקטורים (בריכות) ומשותפים בעודף — אל שותפים בחסר.
 */
export function computeEqualizingTransfers(
  totalNet: number,
  partners: PartnerNet[],
  poolPayers: PoolPayer[],
): EqualSplitResult {
  const n = partners.length
  if (n === 0) {
    return { fairShare: 0, perPartner: [], equalizingTransfers: [], transferCount: 0 }
  }
  const fairShare = roundMoney(totalNet / n)
  const perPartner = partners.map((p) => {
    const diffFromFair = roundMoney(p.net - fairShare)
    return { ...p, diffFromFair }
  })

  type Payer = { label: string; rem: number; payerOrder: number }
  const payers: Payer[] = []
  // Policy: prefer partner-to-partner balancing before using pool money.
  for (const p of perPartner) {
    if (p.diffFromFair > 0.005) {
      payers.push({ label: p.label, rem: p.diffFromFair, payerOrder: 0 })
    }
  }
  for (const pool of poolPayers) {
    const rem = roundMoney(pool.amount)
    if (rem > 0.005) {
      const payerOrder = pool.label === EQUAL_SPLIT_PAYBOX_LABEL ? 1 : 2
      payers.push({ label: pool.label, rem, payerOrder })
    }
  }
  payers.sort((a, b) => {
    if (a.payerOrder !== b.payerOrder) return a.payerOrder - b.payerOrder
    return a.label.localeCompare(b.label, 'he')
  })

  const receivers: { label: string; rem: number }[] = []
  for (const p of perPartner) {
    if (p.diffFromFair < -0.005) {
      receivers.push({ label: p.label, rem: -p.diffFromFair })
    }
  }
  receivers.sort((a, b) => a.label.localeCompare(b.label, 'he'))

  const equalizingTransfers: { fromLabel: string; toLabel: string; amount: number }[] = []
  let pi = 0
  let rj = 0
  while (pi < payers.length && rj < receivers.length) {
    const a = payers[pi]!
    const b = receivers[rj]!
    const pay = roundMoney(Math.min(a.rem, b.rem))
    if (pay < 0.01) {
      if (a.rem <= b.rem) pi += 1
      else rj += 1
      continue
    }
    equalizingTransfers.push({ fromLabel: a.label, toLabel: b.label, amount: pay })
    a.rem = roundMoney(a.rem - pay)
    b.rem = roundMoney(b.rem - pay)
    if (a.rem < 0.01) pi += 1
    if (b.rem < 0.01) rj += 1
  }

  return {
    fairShare,
    perPartner,
    equalizingTransfers,
    transferCount: equalizingTransfers.length,
  }
}

/** @deprecated השתמשו ב־‎computeEqualizingTransfers‎ עם ‎poolPayers ריק */
export function computeEqualProfitSplit(
  totalNet: number,
  partners: PartnerNet[],
): EqualSplitResult {
  return computeEqualizingTransfers(totalNet, partners, [])
}
