/**
 * טקסטים ומיתוג: כרטיס ציבורי (/ticket/…), דף הנחיתה (/), OG.
 * דף הנחיתה — landing* ו־landingExpect* / landingQuotes*.
 */
export const SITE_PARTY_BRAND = {
  venueLine: 'טשרניחובסקי 5',
  welcomeLine: 'שמחים שהגעתם. שמרו את הקישור — זה כרטיס הכניסה הדיגיטלי שלכם.',

  landingHeroEyebrow: 'חוויה חיה · קהילת סטודנטים',
  /** כותרת ראשית קצרה וחזקה */
  landingHeroHeadline: 'לילה שלא תפסיקו לדבר עליו',
  landingHeroSubline: 'מוזיקה מדויקת, קהל חם ואווירה של חצר ירושלמית עד השעות הקטנות.',
  /** גלילה לתוכן האתר — לא התחברות */
  landingHeroCta: 'גלה מסיבות קרובות',
  landingHeroCtaHint: 'המסיבה של שישי שכולם מחכים לה כבר כאן',

  landingLoginTagline: 'ניהול חכם של האירוע שלך — אורחים, כניסה, וחוויה בזמן אמת',

  /** דף הנחיתה — רק בתחתית; קישור ל־`/login` */
  landingFooterLoginCta: 'התחברות והרשמה',
  landingFooterLoginHint: 'לצוות המארגן · ניהול אורחים וסריקה',

  landingExpectTitle: 'מה מחכה לך במסיבה',
  landingExpectSubtitle: 'ארבע סיבות למה לא תרצו לפספס',

  landingExpectItems: [
    { title: 'מוזיקה חיה', body: 'ביטים שנכנסים ישר לגוף.', icon: 'music' as const },
    { title: 'קהל נכון', body: 'אנשים טובים בוייב אחד.', icon: 'people' as const },
    { title: 'אווירת חצר', body: 'חיוכים, אנרגיה ולילה פתוח.', icon: 'vibe' as const },
    { title: 'לייט שואו', body: 'תאורה שמרימה את הרחבה.', icon: 'lights' as const },
  ],

  landingQuotesTitle: 'מה אומרים עלינו',
  landingQuotesSubtitle: 'חוויה אמיתית של מי שהיה ברחבה',

  landingQuotes: [
    {
      quote: 'כל פעם מחדש מופתעים מהאווירה — באמת קשה לעזוב הביתה.',
      author: 'נועה',
    },
    {
      quote: 'המוזיקה והקהל במקום הנכון. כבר חיכינו לסיבוב הבא.',
      author: 'עידן',
    },
    {
      quote: 'מרגישים כמו מסיבה פרטית אבל עם כל הרוח של הקומה שלמה.',
      author: 'מיכל',
    },
  ],

  landingSpotlightTitle: 'מתוך המסיבות',
  landingSpotlightSubtitle: 'תמונות מהשטח — רגעים אמיתיים מהרחבה.',

  landingMorePhotosTitle: 'ועוד מהלילה',
  landingMorePhotosSubtitle: 'עוד פריימים מהאירועים שלנו.',

  galleryTitle: 'רגעים מהערב',
  gallerySubtitle: 'קצב, אור וחברים — מתוך האירועים שלנו.',

  logoAlt: 'סמל טשרניחובסקי 5',
  ogCoverAlt: 'טשרניחובסקי 5 — תמונה מהמסיבה',
  ogSiteName: 'טשרניחובסקי 5',
  ogDescriptionDefault: 'כרטיס כניסה דיגיטלי וזיכרונות מהמסיבה.',

  aboutTitle: 'חוויות שלא שוכחים',
  aboutLead:
    'אנחנו יוצרים מסיבות לסטודנטים שמבינים באווירה — מוזיקה, אנשים טובים ולילות שלא נגמרים.',
  aboutContactIntro:
    'נשמח לקבל פנייה לשאלות, הצעות או תיאום — ניתן ליצור קשר בטלפון:',
  contactPhoneDisplay: '058-5661813',
  contactPhoneTel: '+972585661813',
  aboutImageAlt: 'טשרניחובסקי 5 — אווירת המקום',
} as const
