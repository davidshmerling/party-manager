import { useMemo } from 'react'

export type IncomeRecipientEditOption = { group: string; value: string; label: string }

type Props = {
  wrapClassName?: string
  selectClassName?: string
  value: string | null
  options: IncomeRecipientEditOption[]
  fallbackLabel?: string | null
  disabled?: boolean
  'aria-label'?: string
  onCommit: (next: string) => void | Promise<void>
}

export function IncomeRecipientSelect({
  wrapClassName,
  selectClassName,
  value,
  options,
  fallbackLabel,
  disabled,
  'aria-label': ariaLabel,
  onCommit,
}: Props) {
  const merged = useMemo(() => {
    const v = value
    const o = [...options]
    if (v && !o.some((x) => x.value === v)) {
      o.unshift({ group: '', value: v, label: fallbackLabel ?? v })
    }
    return o
  }, [options, value, fallbackLabel])

  const grouped = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, IncomeRecipientEditOption[]>()
    for (const item of merged) {
      const g = item.group
      if (!map.has(g)) {
        order.push(g)
        map.set(g, [])
      }
      map.get(g)!.push(item)
    }
    return { order, map }
  }, [merged])

  if (options.length === 0) {
    return (
      <span className={wrapClassName} title={fallbackLabel ?? undefined}>
        {fallbackLabel ?? '—'}
      </span>
    )
  }

  return (
    <select
      className={selectClassName}
      aria-label={ariaLabel}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => void onCommit(e.target.value)}
    >
      {grouped.order.flatMap((g) => {
        const items = grouped.map.get(g)!
        if (g === '') {
          return items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))
        }
        return (
          <optgroup key={g} label={g}>
            {items.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
