/** משוב מגע (אנדרואיד/חלק ממכשירי iOS) — שקט אם אין תמיכה */
export function hapticSuccess(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(18)
    }
  } catch {
    /* ignore */
  }
}

export function hapticError(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([30, 40, 30])
    }
  } catch {
    /* ignore */
  }
}

export function hapticLight(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8)
    }
  } catch {
    /* ignore */
  }
}
