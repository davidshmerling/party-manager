/**
 * תגיות מינימליות: × / ✓ בכל הטורים (כניסה, דף, הזמנה) — הצבע ב־CSS מבדיל.
 */
export const statusTag = {
  enterNo: '×',
  enterYes: '✓',
  inviteNo: '×',
  inviteYes: '✓',
  pageNo: '×',
  pageYes: '✓',
} as const

export function inviteMixedLabel(sent: number, total: number): string {
  return `${sent}/${total}`
}
