// Korean launch (feat/ko-launch) — localized display labels for the operator
// "highlights" / From-the-maker panel on the public place page.
//
// The English source strings live in lib/operator-highlights/config.js, a
// SHARED config also used by the operator dashboard EDITOR. Those config values
// must stay English (the editor is English-only), so we localize at the PUBLIC
// render layer only: keyed by the EXACT English `heading` / field `label`
// strings from config.js (curly apostrophes and ampersands included).
//
// Every resolver falls back to the English string when there is no Korean entry
// or when locale !== 'ko', so a heading/label is never blank and English is
// byte-identical.

// Section headings ("From the roastery", …). Keys are the exact English
// `heading` values from FIELDS in config.js.
export const KO_HIGHLIGHT_HEADINGS = {
  'From the roastery': '로스터리에서',
  'From the café': '카페에서',
  'From the maker': '메이커의 이야기',
  'From the studio': '스튜디오에서',
  'From the kitchen': '주방에서',
  'What’s on': '지금 진행 중',
  'In the shop': '상점에서',
  'Your stay': '숙박 안내',
  'Before you book': '예약 전에',
}

// Field labels. Keys are the exact English `label` values from FIELDS in
// config.js (including curly apostrophes and & ampersands).
export const KO_HIGHLIGHT_LABELS = {
  // fine_grounds_roaster
  'On the roaster now': '지금 로스팅 중',
  'Where to find our coffee': '커피를 만날 수 있는 곳',
  'Coffee subscription': '커피 구독',
  // fine_grounds_cafe
  'Beans we’re pouring': '지금 내리는 원두',
  'On the menu': '메뉴 안내',
  'Menu or order ahead': '메뉴·미리 주문',
  // sba
  'Latest release': '최신 출시',
  'On now': '지금 즐길 수 있는 것',
  'Where to buy': '구입처',
  'Online shop': '온라인 상점',
  // craft
  'In the studio now': '지금 스튜디오에서',
  'Classes & enrolments': '클래스·수강 신청',
  'Book a class': '클래스 예약',
  'Shop or commission': '구매·주문 제작',
  // table
  'On the menu now': '지금 메뉴에',
  'See the menu': '메뉴 보기',
  'Book a table': '테이블 예약',
  // collection
  // ('On now' shared with sba above; 'What’s on' as a URL label below)
  'What’s on': '진행 중인 전시',
  'Admission': '입장 안내',
  // corner
  'New in store': '새로 들어온 상품',
  'Shop online': '온라인 쇼핑',
  // found
  'Just arrived': '방금 입고',
  'Find us at': '만날 수 있는 곳',
  // rest
  'Availability & stays': '예약 가능·숙박',
  'Current offer': '현재 프로모션',
  'Book direct': '직접 예약',
  // way
  'What’s running': '진행 중인 프로그램',
  'Book this experience': '이 체험 예약',
}

// Korean label from a map, else the English fallback, never blank. Mirrors
// listingLabels.js's localize().
function localize(map, key, locale) {
  if (locale === 'ko' && key != null && map[key]) return map[key]
  return key ?? null
}

// Localize a highlight section heading (the panel title). English fallback.
export function localizeHighlightHeading(englishHeading, locale) {
  return localize(KO_HIGHLIGHT_HEADINGS, englishHeading, locale)
}

// Localize a highlight field label. English fallback.
export function localizeHighlightLabel(englishLabel, locale) {
  return localize(KO_HIGHLIGHT_LABELS, englishLabel, locale)
}
