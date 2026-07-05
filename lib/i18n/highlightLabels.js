// Multilingual launch (feat/ko-launch → feat/zh-launch) — localized display
// labels for the operator "highlights" / From-the-maker panel on the public
// place page.
//
// The English source strings live in lib/operator-highlights/config.js, a
// SHARED config also used by the operator dashboard EDITOR. Those config values
// must stay English (the editor is English-only), so we localize at the PUBLIC
// render layer only: keyed by the EXACT English `heading` / field `label`
// strings from config.js (curly apostrophes and ampersands included).
//
// Every resolver falls back to the English string when there is no entry for
// the active locale, so a heading/label is never blank and English is
// byte-identical.

// ── Korean (한국어) ──────────────────────────────────────────────────────────

// Section headings ("From the roastery", …).
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

export const KO_HIGHLIGHT_LABELS = {
  'On the roaster now': '지금 로스팅 중',
  'Where to find our coffee': '커피를 만날 수 있는 곳',
  'Coffee subscription': '커피 구독',
  'Beans we’re pouring': '지금 내리는 원두',
  'On the menu': '메뉴 안내',
  'Menu or order ahead': '메뉴·미리 주문',
  'Latest release': '최신 출시',
  'On now': '지금 즐길 수 있는 것',
  'Where to buy': '구입처',
  'Online shop': '온라인 상점',
  'In the studio now': '지금 스튜디오에서',
  'Classes & enrolments': '클래스·수강 신청',
  'Book a class': '클래스 예약',
  'Shop or commission': '구매·주문 제작',
  'On the menu now': '지금 메뉴에',
  'See the menu': '메뉴 보기',
  'Book a table': '테이블 예약',
  'What’s on': '진행 중인 전시',
  'Admission': '입장 안내',
  'New in store': '새로 들어온 상품',
  'Shop online': '온라인 쇼핑',
  'Just arrived': '방금 입고',
  'Find us at': '만날 수 있는 곳',
  'Availability & stays': '예약 가능·숙박',
  'Current offer': '현재 프로모션',
  'Book direct': '직접 예약',
  'What’s running': '진행 중인 프로그램',
  'Book this experience': '이 체험 예약',
}

// ── Simplified Chinese (简体中文) ─────────────────────────────────────────────

export const ZH_HIGHLIGHT_HEADINGS = {
  'From the roastery': '来自烘焙坊',
  'From the café': '来自咖啡馆',
  'From the maker': '匠人自述',
  'From the studio': '来自工作室',
  'From the kitchen': '来自厨房',
  'What’s on': '正在进行',
  'In the shop': '店内在售',
  'Your stay': '您的住宿',
  'Before you book': '预订前须知',
}

export const ZH_HIGHLIGHT_LABELS = {
  'On the roaster now': '当前烘焙',
  'Where to find our coffee': '在哪里买到我们的咖啡',
  'Coffee subscription': '咖啡订阅',
  'Beans we’re pouring': '正在冲煮的豆子',
  'On the menu': '菜单精选',
  'Menu or order ahead': '菜单与预点',
  'Latest release': '最新出品',
  'On now': '现正供应',
  'Where to buy': '购买地点',
  'Online shop': '在线商店',
  'In the studio now': '工作室近况',
  'Classes & enrolments': '课程与报名',
  'Book a class': '预订课程',
  'Shop or commission': '选购或定制',
  'On the menu now': '当前菜单',
  'See the menu': '查看菜单',
  'Book a table': '预订餐位',
  'What’s on': '正在展出',
  'Admission': '入场信息',
  'New in store': '新品上架',
  'Shop online': '在线选购',
  'Just arrived': '刚刚到店',
  'Find us at': '在这里找到我们',
  'Availability & stays': '空房与住宿',
  'Current offer': '当前优惠',
  'Book direct': '直接预订',
  'What’s running': '正在开展的项目',
  'Book this experience': '预订此体验',
}

// ── Resolvers ────────────────────────────────────────────────────────────────

const HEADINGS = { ko: KO_HIGHLIGHT_HEADINGS, zh: ZH_HIGHLIGHT_HEADINGS }
const LABELS = { ko: KO_HIGHLIGHT_LABELS, zh: ZH_HIGHLIGHT_LABELS }

// Localized string from the active locale's map, else the English fallback.
function localize(mapsByLocale, key, locale) {
  const map = mapsByLocale && mapsByLocale[locale]
  if (map && key != null && map[key]) return map[key]
  return key ?? null
}

// Localize a highlight section heading (the panel title). English fallback.
export function localizeHighlightHeading(englishHeading, locale) {
  return localize(HEADINGS, englishHeading, locale)
}

// Localize a highlight field label. English fallback.
export function localizeHighlightLabel(englishLabel, locale) {
  return localize(LABELS, englishLabel, locale)
}
