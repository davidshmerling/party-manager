export function formatNis(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ‏₪`
}

export function financeAdminLabel(a: { display_name: string; email: string }): string {
  const d = a.display_name?.trim()
  if (d) return d
  return a.email || '—'
}
