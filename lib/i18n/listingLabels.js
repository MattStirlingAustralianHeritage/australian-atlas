// Korean launch (feat/ko-launch) — localized display labels for listing
// category, sub-type, and region name.
//
// These are display strings only; the underlying English values on `listings`
// are unchanged. Every resolver falls back to the English label when there is no
// Korean entry, so a label is never blank.

// Vertical → category label (mirrors VERTICAL_CATEGORY_LABELS in the place page).
export const KO_VERTICAL_CATEGORY_LABELS = {
  sba: '수제 생산자',
  collection: '문화 기관',
  craft: '공방·스튜디오',
  fine_grounds: '스페셜티 커피',
  rest: '부티크 숙소',
  field: '자연 명소',
  corner: '독립 상점',
  found: '빈티지·중고',
  table: '독립 다이닝',
  way: '체험',
}

// sub_type / meta subcategory → label (Korean). Keyed by the raw value.
export const KO_SUBCATEGORY_LABELS = {
  winery: '와이너리', distillery: '증류소', brewery: '브루어리',
  cidery: '사이더리', non_alcoholic: '무알코올', meadery: '미드 양조장',
  museum: '박물관', gallery: '갤러리', heritage_site: '문화유산',
  cultural_centre: '문화 센터', botanical_garden: '식물원',
  sculpture_park: '조각 공원', cinema: '영화관', drive_in: '드라이브인 극장',
  live_music_venue: '라이브 음악 공연장', comedy_club: '코미디 클럽', theatre: '극장',
  ceramics_clay: '도예·점토', visual_art: '시각 예술',
  jewellery_metalwork: '주얼리·금속공예', textile_fibre: '섬유·직물',
  wood_furniture: '목공·가구', glass: '유리공예', printmaking: '판화',
  leathermaker: '가죽공예', shoemaker: '수제화',
  roaster: '로스터', cafe: '카페',
  boutique_hotel: '부티크 호텔', guesthouse: '게스트하우스', bnb: 'B&B',
  farm_stay: '팜스테이', glamping: '글램핑', cottage: '코티지',
  self_contained: '독립형 숙소',
  heritage_hotel: '헤리티지 호텔', national_park_stay: '국립공원 숙소',
  heritage_lighthouse: '헤리티지 등대',
  swimming_hole: '천연 물놀이터', waterfall: '폭포', lookout: '전망대',
  gorge: '협곡', coastal_walk: '해안 산책로', hot_spring: '온천',
  cave: '동굴', national_park: '국립공원', bush_walk: '부시워크',
  wildlife_zoo: '야생동물·동물원', botanic_garden: '식물원', nature_reserve: '자연보호구역',
  bookshop: '서점', record_store: '음반 가게', homewares: '홈웨어',
  clothing: '의류', general_store: '잡화점', stationery: '문구점',
  vintage_clothing: '빈티지 의류', vintage_furniture: '빈티지 가구',
  vintage_store: '빈티지 상점', antiques: '골동품', op_shop: '자선 중고점',
  books_ephemera: '책·수집품', art_objects: '아트 오브제', market: '마켓',
  restaurant: '레스토랑', bakery: '베이커리', farm_gate: '팜 게이트',
  artisan_producer: '수제 생산자', specialty_retail: '전문 소매점',
  destination: '데스티네이션', providore: '식료품점',
}

// Vertical → the small-caps KICKER label shown on cards/heroes (mirrors the
// short brand words: "Small Batch", "Fine Grounds", "Table", etc. — NOT the
// longer category descriptors in KO_VERTICAL_CATEGORY_LABELS). Natural Korean
// transliterations consistent with the brand names.
export const KO_VERTICAL_KICKER_LABELS = {
  sba: '스몰 배치',
  fine_grounds: '파인 그라운즈',
  table: '테이블',
  craft: '크래프트',
  collection: '컬처',
  rest: '레스트',
  field: '필드',
  corner: '코너',
  found: '파운드',
  way: '웨이',
}

// Vertical → the one-line descriptive blurb shown under a vertical section
// heading on the region detail page (e.g. "Distilleries, wineries, and artisan
// producers"). Keyed by vertical; the English source lives in
// VERTICAL_DESCRIPTIONS in app/regions/[slug]/page.js and stays unchanged.
export const KO_VERTICAL_DESCRIPTIONS = {
  sba: '증류소, 와이너리, 수제 생산자',
  collection: '갤러리, 박물관, 문화 컬렉션',
  craft: '메이커, 스튜디오, 공방',
  fine_grounds: '스페셜티 커피 로스터',
  rest: '부티크 숙소와 이색 숙박',
  field: '자연 체험과 야외 명소',
  corner: '독립 상점과 큐레이티드 리테일',
  found: '빈티지·골동품·중고 발견',
  table: '독립 다이닝과 식품 생산자',
  way: '가이드 워크, 투어, 어드벤처 체험',
}

// Region name (English canonical) → Korean. Major regions; falls back to the
// English name for anything not listed.
export const KO_REGION_LABELS = {
  'Barossa Valley': '바로사 밸리',
  'Adelaide Hills': '애들레이드 힐스',
  'Adelaide': '애들레이드',
  'McLaren Vale': '맥라렌 베일',
  'Mornington Peninsula': '모닝턴 반도',
  'Yarra Valley': '야라 밸리',
  'Melbourne': '멜버른',
  'Great Ocean Road': '그레이트 오션 로드',
  'Sydney': '시드니',
  'Blue Mountains': '블루 마운틴스',
  'Byron Bay': '바이런 베이',
  'Byron Hinterland': '바이런 힌터랜드',
  'Hunter Valley': '헌터 밸리',
  'Hobart & Southern Tasmania': '호바트 & 남부 태즈메이니아',
  'Hobart': '호바트',
  'Launceston & Tamar Valley': '론서스턴 & 타마 밸리',
  'Brisbane': '브리즈번',
  'Gold Coast': '골드코스트',
  'Sunshine Coast': '선샤인코스트',
  'Perth': '퍼스',
  'Margaret River': '마거릿 리버',
  'Darwin': '다윈',
  'Canberra': '캔버라',
  'Tasmania': '태즈메이니아',
}

// Generic resolver: Korean label from a map, else the English fallback, never blank.
function localize(map, key, englishFallback, locale) {
  if (locale === 'ko' && key != null && map[key]) return map[key]
  return englishFallback ?? (key != null ? String(key) : null)
}

export function localizeVerticalCategory(vertical, englishFallback, locale) {
  return localize(KO_VERTICAL_CATEGORY_LABELS, vertical, englishFallback, locale)
}

// Vertical one-line descriptive blurb (region detail page section headers).
// Ko blurb for 'ko', else the English fallback — never blank.
export function localizeVerticalDescription(vertical, englishFallback, locale) {
  return localize(KO_VERTICAL_DESCRIPTIONS, vertical, englishFallback, locale)
}

export function localizeSubcategory(rawValue, englishFallback, locale) {
  return localize(KO_SUBCATEGORY_LABELS, rawValue, englishFallback, locale)
}

export function localizeRegionName(regionName, locale) {
  return localize(KO_REGION_LABELS, regionName, regionName, locale)
}

// Vertical KICKER label (the short small-caps brand word on cards/heroes). Ko
// label for 'ko', else the English fallback — never blank.
export function localizeVerticalKicker(vertical, englishFallback, locale) {
  return localize(KO_VERTICAL_KICKER_LABELS, vertical, englishFallback, locale)
}
