/** שמור סנכרון עם ‎src/utils/formatIsraelMobileE164.ts */

function stripToIsraeliDigits(phone: string): string {
  let digits = String(phone ?? '').replace(/\D/g, '')
  for (let i = 0; i < 4 && digits.startsWith('00') && digits.length > 2; i++) {
    digits = digits.slice(2)
  }
  if (digits.length === 13 && digits.startsWith('9720') && digits[4] === '5') {
    digits = `972${digits.slice(4)}`
  }
  return digits
}

export function formatIsraelMobileE164(phone: string): string | null {
  const digits = stripToIsraeliDigits(phone)
  if (!digits) return null

  if (digits.length === 12 && digits.startsWith('972') && digits[3] === '5') {
    return `+${digits}`
  }

  if (digits.length === 10 && digits.startsWith('05')) {
    return `+972${digits.slice(1)}`
  }

  if (digits.length === 9 && digits.startsWith('5')) {
    return `+972${digits}`
  }

  return null
}

export function normalizePhoneForWa(phone: string): string {
  const e164 = formatIsraelMobileE164(phone)
  if (e164) return e164.slice(1)
  const digits = stripToIsraeliDigits(phone)
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('05')) return `972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`
  return digits
}
