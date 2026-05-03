let seq = 0

export function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  seq = (seq + 1) % 1_000_000_000
  return `cid-${Date.now()}-${seq}`
}
