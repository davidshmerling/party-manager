import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { logUserActivity } from '../services/loggingApi'

function summarizeElement(el: EventTarget | null): Record<string, unknown> {
  if (!(el instanceof Element)) return { target: String(el) }
  const tag = el.tagName?.toLowerCase() ?? '?'
  if (tag === 'html' || tag === 'body') return { tag }

  const id = el.id || undefined
  let className: string | undefined
  if (typeof (el as HTMLElement).className === 'string') {
    className = (el as HTMLElement).className
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 16)
      .join(' ')
  }
  const role = el.getAttribute('role') ?? undefined
  const inputType = el.getAttribute('type') ?? undefined
  const nameAttr = el.getAttribute('name') ?? undefined
  const ariaLabel = el.getAttribute('aria-label') ?? undefined
  const dataTestId = el.getAttribute('data-testid') ?? undefined
  let textSnippet: string | undefined
  try {
    const t = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ')
    if (t) textSnippet = t.slice(0, 500)
  } catch {
    /* ignore */
  }
  const href = el instanceof HTMLAnchorElement ? el.href : undefined
  const parents: string[] = []
  let p: Element | null = el.parentElement
  for (let i = 0; i < 5 && p; i++) {
    const tid = p.id ? `#${p.id}` : ''
    parents.push(`${p.tagName.toLowerCase()}${tid}`)
    p = p.parentElement
  }
  return {
    tag,
    id: id || undefined,
    className: className || undefined,
    role,
    inputType,
    nameAttr,
    ariaLabel,
    dataTestId,
    textSnippet,
    href,
    parentChain: parents,
  }
}

/**
 * רישום ניווט וקליקים — **רק לצוות** (אדמין / שותף / סורק). לא לאורחים או משתמשי member.
 */
export function UserActivityInstrument() {
  const { isStaff } = useAuth()
  const location = useLocation()
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    if (!isStaff) return
    const key = `${location.pathname}${location.search}${location.hash}`
    const prev = prevPath.current
    prevPath.current = key
    if (prev === null) {
      logUserActivity({ kind: 'nav', action: 'initial', detail: { to: key } })
    } else if (prev !== key) {
      logUserActivity({ kind: 'nav', action: 'route', detail: { from: prev, to: key } })
    }
  }, [isStaff, location.pathname, location.search, location.hash])

  useEffect(() => {
    if (!isStaff) return
    const onClick = (ev: MouseEvent) => {
      const t = ev.target
      if (!(t instanceof Node)) return
      const el = t instanceof Element ? t : t.parentElement
      const actionable =
        el?.closest(
          'button, a, [role="button"], input[type="submit"], input[type="button"], [data-log-click]',
        ) ?? el
      logUserActivity({
        kind: 'click',
        action: 'pointer',
        detail: {
          button: ev.button,
          ctrlKey: ev.ctrlKey,
          shiftKey: ev.shiftKey,
          metaKey: ev.metaKey,
          altKey: ev.altKey,
          target: summarizeElement(ev.target),
          actionableNearest:
            actionable && actionable !== ev.target ? summarizeElement(actionable) : undefined,
        },
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [isStaff])

  return null
}
