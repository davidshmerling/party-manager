/** עיגול אגורות לחישובי חלוקה */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type PartnerNet = { id: string; label: string; net: number }

export type EqualSplitResult = {
  fairShare: number
  perPartner: { id: string; label: string; net: number; diffFromFair: number }[]
  payboxTransfers: { fromLabel: string; toLabel: string; amount: number }[]
  transferCount: number
}

/** בריכת פייבוקס בהוראות איזון — תווית קבועה (מופיעה ראשונה ברשימת משלמים) */
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
    return { fairShare: 0, perPartner: [], payboxTransfers: [], transferCount: 0 }
  }
  const fairShare = roundMoney(totalNet / n)
  const perPartner = partners.map((p) => {
    const diffFromFair = roundMoney(p.net - fairShare)
    return { ...p, diffFromFair }
  })

  type Payer = { label: string; rem: number; poolOrder: number }
  const payers: Payer[] = []
  for (const pool of poolPayers) {
    const rem = roundMoney(pool.amount)
    if (rem > 0.005) {
      const poolOrder = pool.label === EQUAL_SPLIT_PAYBOX_LABEL ? 0 : 1
      payers.push({ label: pool.label, rem, poolOrder })
    }
  }
  for (const p of perPartner) {
    if (p.diffFromFair > 0.005) {
      payers.push({ label: p.label, rem: p.diffFromFair, poolOrder: 2 })
    }
  }
  payers.sort((a, b) => {
    if (a.poolOrder !== b.poolOrder) return a.poolOrder - b.poolOrder
    return a.label.localeCompare(b.label, 'he')
  })

  const receivers: { label: string; rem: number }[] = []
  for (const p of perPartner) {
    if (p.diffFromFair < -0.005) {
      receivers.push({ label: p.label, rem: -p.diffFromFair })
    }
  }
  receivers.sort((a, b) => a.label.localeCompare(b.label, 'he'))

  const payboxTransfers: { fromLabel: string; toLabel: string; amount: number }[] = []
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
    payboxTransfers.push({ fromLabel: a.label, toLabel: b.label, amount: pay })
    a.rem = roundMoney(a.rem - pay)
    b.rem = roundMoney(b.rem - pay)
    if (a.rem < 0.01) pi += 1
    if (b.rem < 0.01) rj += 1
  }

  return {
    fairShare,
    perPartner,
    payboxTransfers,
    transferCount: payboxTransfers.length,
  }
}

/** @deprecated השתמשו ב־‎computeEqualizingTransfers‎ עם ‎poolPayers ריק */
export function computeEqualProfitSplit(
  totalNet: number,
  partners: PartnerNet[],
): EqualSplitResult {
  return computeEqualizingTransfers(totalNet, partners, [])
}
