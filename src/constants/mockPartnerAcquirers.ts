/**
 * מוק סולקים — בעתיד חיבור נפרד למורנינג / גרו לכל שותף.
 * הסיבוב הבא ייתן קישור לשותף הבא ברשימה (ולאחר מכן: למי שיש הכי מעט רוכשים).
 */
export type MockPartnerAcquirer = {
  slug: string
  labelHe: string
  /** טקסט מוצג לצוות — לא משפיע על תשלום אמיתי */
  futureProviderNoteHe: string
}

export const MOCK_PARTNER_ACQUIRERS: MockPartnerAcquirer[] = [
  {
    slug: 'partner-demo-a',
    labelHe: 'שותף דמו א׳',
    futureProviderNoteHe: 'מוק · בעתיד: סולק מורנינג',
  },
  {
    slug: 'partner-demo-b',
    labelHe: 'שותף דמו ב׳',
    futureProviderNoteHe: 'מוק · בעתיד: סולק גרו',
  },
]
