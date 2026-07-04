// Multilingual launch (feat/ko-launch → feat/zh-launch) — localized display
// labels for listing category, sub-type, and region name.
//
// These are display strings only; the underlying English values on `listings`
// are unchanged. Every resolver falls back to the English label when there is no
// entry for the active locale, so a label is never blank.

// ── Korean (한국어) ──────────────────────────────────────────────────────────

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
  leathermaker: '가죽공예', shoemaker: '수제화', fragrance_candles: '향수·캔들',
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

// Vertical → the small-caps KICKER label shown on cards/heroes.
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

// Vertical → one-line descriptive blurb under a vertical section heading.
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

// Region name (English canonical) → Korean. Major regions; English fallback.
export const KO_REGION_LABELS = {
  "Adelaide": "애들레이드",
  "Adelaide Hills": "애들레이드 힐스",
  "Alice Springs & Red Centre": "앨리스 스프링스 & 레드 센터",
  "Australia's Coral Coast": "오스트레일리아 코럴 해안",
  "Australia's Golden Outback": "오스트레일리아 골든 아웃백",
  "Ballarat & Goldfields": "밸러랫 & 골드필즈",
  "Barossa Valley": "바로사 밸리",
  "Bellarine Peninsula": "벨라린 반도",
  "Bendigo": "벤디고",
  "Blue Mountains": "블루 마운틴스",
  "Brisbane": "브리즈번",
  "Byron Bay": "바이런 베이",
  "Byron Hinterland": "바이런 힌터랜드",
  "Cairns & Tropical North": "케언즈 & 트로피컬 노스",
  "Canberra": "캔버라",
  "Canberra District": "캔버라 지역",
  "Canberra Wine District": "캔버라 와인 지역",
  "Capricorn Coast": "카프리콘 해안",
  "Central Coast": "센트럴 해안",
  "Central Victoria": "센트럴 빅토리아",
  "Clare Valley": "클레어 밸리",
  "Coffs Coast": "코프스 해안",
  "Cradle Country": "크레들 컨트리",
  "Darwin": "다윈",
  "Darwin & Top End": "다윈 & 톱 엔드",
  "Daylesford & Hepburn Springs": "데일즈포드 & 헵번 스프링스",
  "East Coast Tasmania": "이스트 코스트 태즈메이니아",
  "Eurobodalla": "유로보달라",
  "Eyre Peninsula": "아이어 반도",
  "Fremantle & Swan Valley": "프리맨틀 & 스완 밸리",
  "Geelong": "질롱",
  "Gippsland": "깁스랜드",
  "Gold Coast": "골드코스트",
  "Gold Coast Hinterland": "골드 코스트 힌터랜드",
  "Goulburn Valley": "굴번 밸리",
  "Grampians": "그램피언스",
  "Granite Belt": "그래니트 벨트",
  "Great Barrier Reef": "그레이트 배리어 리프",
  "Great Ocean Road": "그레이트 오션 로드",
  "Great Southern": "그레이트 서던",
  "Hobart": "호바트",
  "Hobart & Southern Tasmania": "호바트 & 서던 태즈메이니아",
  "Hobart City": "호바트 시티",
  "Hunter Valley": "헌터 밸리",
  "Kangaroo Island": "캥거루 아일랜드",
  "Katherine & Surrounds": "캐서린 & 서라운드",
  "Launceston & Tamar Valley": "론세스톤 & 태머 밸리",
  "Limestone Coast": "라임스톤 해안",
  "Macedon Ranges": "매세돈 레인지스",
  "Margaret River": "마가렛 리버",
  "McLaren Vale": "맥라렌 베일",
  "Melbourne": "멜버른",
  "Mildura & the Mallee": "밀두라 & 더 말리",
  "Mornington Peninsula": "모닝턴 반도",
  "Mudgee": "머지",
  "New England North West": "뉴 잉글랜드 노스 웨스트",
  "Newcastle": "뉴캐슬",
  "Northern Rivers": "노던 리버스",
  "Orange": "오렌지",
  "Perth": "퍼스",
  "Phillip Island": "필립 아일랜드",
  "Port Macquarie & Hastings": "포트 매쿼리 & 헤스팅스",
  "Riverina": "리베리나",
  "Sapphire Coast": "샤파이어 해안",
  "Scenic Rim": "시닉 림",
  "Snowy Mountains": "스노위 마운틴스",
  "South Coast NSW": "사우스 코스트 NSW",
  "Southern Forests": "서던 포레스츠",
  "Southern Highlands": "서던 하이랜드",
  "Sunshine Coast": "선샤인 코스트",
  "Sunshine Coast Hinterland": "선샤인 코스트 힌터랜드",
  "Sydney": "시드니",
  "Tarkine & West Coast": "타르킨 & 웨스트 코스트",
  "Tasmania": "태즈메이니아",
  "Toowoomba & Darling Downs": "투움바 & 달링 다운스",
  "Townsville": "타운즈빌",
  "Victorian High Country": "빅토리언 하이 컨트리",
  "Whitsundays": "휘츠언데이스",
  "Wollongong": "울롱공",
  "Yarra Valley": "야라 밸리",
}

// ── Simplified Chinese (简体中文) ─────────────────────────────────────────────

export const ZH_VERTICAL_CATEGORY_LABELS = {
  sba: '手工生产者',
  collection: '文化机构',
  craft: '工作室与手作',
  fine_grounds: '精品咖啡',
  rest: '精品住宿',
  field: '自然景观',
  corner: '独立商店',
  found: '复古与二手',
  table: '独立餐饮',
  way: '体验活动',
}

export const ZH_SUBCATEGORY_LABELS = {
  winery: '酒庄', distillery: '蒸馏酒厂', brewery: '精酿啤酒厂',
  cidery: '苹果酒厂', non_alcoholic: '无酒精饮品', meadery: '蜂蜜酒厂',
  museum: '博物馆', gallery: '画廊', heritage_site: '文化遗产',
  cultural_centre: '文化中心', botanical_garden: '植物园',
  sculpture_park: '雕塑公园', cinema: '电影院', drive_in: '汽车影院',
  live_music_venue: '现场音乐场馆', comedy_club: '喜剧俱乐部', theatre: '剧院',
  ceramics_clay: '陶艺', visual_art: '视觉艺术',
  jewellery_metalwork: '珠宝金工', textile_fibre: '纺织纤维艺术',
  wood_furniture: '木工家具', glass: '玻璃艺术', printmaking: '版画',
  leathermaker: '皮革工艺', shoemaker: '手工制鞋', fragrance_candles: '香氛与蜡烛',
  roaster: '咖啡烘焙商', cafe: '咖啡馆',
  boutique_hotel: '精品酒店', guesthouse: '民宿', bnb: '家庭旅馆',
  farm_stay: '农场住宿', glamping: '豪华露营', cottage: '乡村小屋',
  self_contained: '独立式住宿',
  heritage_hotel: '古迹酒店', national_park_stay: '国家公园住宿',
  heritage_lighthouse: '古迹灯塔',
  swimming_hole: '天然泳池', waterfall: '瀑布', lookout: '观景台',
  gorge: '峡谷', coastal_walk: '海岸步道', hot_spring: '温泉',
  cave: '溶洞', national_park: '国家公园', bush_walk: '丛林徒步',
  wildlife_zoo: '野生动物园', botanic_garden: '植物园', nature_reserve: '自然保护区',
  bookshop: '书店', record_store: '唱片店', homewares: '家居用品',
  clothing: '服饰', general_store: '杂货店', stationery: '文具店',
  vintage_clothing: '复古服饰', vintage_furniture: '复古家具',
  vintage_store: '复古商店', antiques: '古董', op_shop: '慈善二手店',
  books_ephemera: '书籍与收藏品', art_objects: '艺术品', market: '市集',
  restaurant: '餐厅', bakery: '烘焙坊', farm_gate: '农场直售',
  artisan_producer: '手工生产者', specialty_retail: '专营零售',
  destination: '目的地', providore: '食材专卖店',
}

export const ZH_VERTICAL_KICKER_LABELS = {
  sba: '小批量',
  fine_grounds: '精品咖啡',
  table: '餐桌',
  craft: '手作',
  collection: '文化',
  rest: '栖息',
  field: '原野',
  corner: '街角',
  found: '寻获',
  way: '在路上',
}

export const ZH_VERTICAL_DESCRIPTIONS = {
  sba: '蒸馏酒厂、酒庄与手工生产者',
  collection: '画廊、博物馆与文化收藏',
  craft: '匠人、工作室与手作坊',
  fine_grounds: '精品咖啡烘焙商',
  rest: '精品住宿与特色旅宿',
  field: '自然体验与户外景观',
  corner: '独立商店与精选零售',
  found: '复古、古董与二手寻宝',
  table: '独立餐饮与食品生产者',
  way: '向导徒步、旅游团与探险体验',
}

// Region name (English canonical) → Simplified Chinese. Rendered from
// scripts/translate-region-names.mjs --locale zh (standard Chinese exonyms) plus
// a few plain city/state names that occur as raw listings.region values but are
// not separate "live" region rows. English fallback for anything not listed.
export const ZH_REGION_LABELS = {
  "Adelaide": "阿德莱德",
  "Adelaide Hills": "阿德莱德丘陵",
  "Alice Springs & Red Centre": "爱丽丝泉和红色中心",
  "Australia's Coral Coast": "澳大利亚珊瑚海岸",
  "Australia's Golden Outback": "澳大利亚黄金内陆",
  "Ballarat & Goldfields": "巴拉瑞特和金矿地区",
  "Barossa Valley": "巴罗萨谷",
  "Bellarine Peninsula": "贝拉林半岛",
  "Bendigo": "本迪戈",
  "Blue Mountains": "蓝山",
  "Brisbane": "布里斯班",
  "Byron Bay": "拜伦湾",
  "Cairns & Tropical North": "凯恩斯和热带北部",
  "Canberra": "堪培拉",
  "Canberra District": "堪培拉地区",
  "Canberra Wine District": "堪培拉葡萄酒地区",
  "Capricorn Coast": "摩羯海岸",
  "Central Coast": "中央海岸",
  "Central Victoria": "维多利亚中部",
  "Clare Valley": "克莱尔谷",
  "Coffs Coast": "科夫斯海岸",
  "Cradle Country": "摇篮地区",
  "Darwin": "达尔文",
  "Darwin & Top End": "达尔文和北领地",
  "Daylesford & Hepburn Springs": "代尔斯福德和赫本泉",
  "East Coast Tasmania": "塔斯马尼亚东海岸",
  "Eurobodalla": "尤罗博达拉",
  "Eyre Peninsula": "艾尔半岛",
  "Fremantle & Swan Valley": "弗里曼特尔和天鹅谷",
  "Geelong": "吉隆",
  "Gippsland": "吉普斯兰",
  "Gold Coast": "黄金海岸",
  "Gold Coast Hinterland": "黄金海岸腹地",
  "Goulburn Valley": "古尔本谷",
  "Grampians": "格兰屏山脉",
  "Granite Belt": "花岗岩地带",
  "Great Barrier Reef": "大堡礁",
  "Great Ocean Road": "大洋路",
  "Great Southern": "大南部地区",
  "Hobart": "霍巴特",
  "Hobart & Southern Tasmania": "霍巴特和塔斯马尼亚南部",
  "Hobart City": "霍巴特市",
  "Hunter Valley": "猎人谷",
  "Kangaroo Island": "袋鼠岛",
  "Katherine & Surrounds": "凯瑟琳及周边地区",
  "Launceston & Tamar Valley": "朗塞斯顿和塔玛谷",
  "Limestone Coast": "石灰岩海岸",
  "Macedon Ranges": "马其顿山脉",
  "Margaret River": "玛格丽特河",
  "McLaren Vale": "麦克拉伦谷",
  "Melbourne": "墨尔本",
  "Mildura & the Mallee": "米尔迪拉和玛丽谷地",
  "Mornington Peninsula": "莫宁顿半岛",
  "Mudgee": "马吉",
  "New England North West": "新英格兰西北地区",
  "Newcastle": "纽卡斯尔",
  "Northern Rivers": "北部河流地区",
  "Orange": "奥兰治",
  "Perth": "珀斯",
  "Phillip Island": "菲利普岛",
  "Port Macquarie & Hastings": "麦夸里港和黑斯廷斯",
  "Riverina": "里弗瑞纳地区",
  "Sapphire Coast": "蓝宝石海岸",
  "Scenic Rim": "风景秀丽山地",
  "Snowy Mountains": "雪山",
  "South Coast NSW": "新州南海岸",
  "Southern Forests": "南部森林",
  "Southern Highlands": "南部高地",
  "Sunshine Coast": "阳光海岸",
  "Sunshine Coast Hinterland": "阳光海岸腹地",
  "Sydney": "悉尼",
  "Tarkine & West Coast": "塔基涅和西海岸",
  "Tasmania": "塔斯马尼亚",
  "Toowoomba & Darling Downs": "图瓦姆巴和达令高地",
  "Townsville": "汤斯维尔",
  "Victorian High Country": "维多利亚高地",
  "Whitsundays": "圣灵群岛",
  "Wollongong": "卧龙岗",
  "Yarra Valley": "雅拉谷",
}

// ── Resolvers ────────────────────────────────────────────────────────────────

// Per-map locale bundles. Add a locale's map here to light it up everywhere.
const CATEGORY = { ko: KO_VERTICAL_CATEGORY_LABELS, zh: ZH_VERTICAL_CATEGORY_LABELS }
const SUBCATEGORY = { ko: KO_SUBCATEGORY_LABELS, zh: ZH_SUBCATEGORY_LABELS }
const KICKER = { ko: KO_VERTICAL_KICKER_LABELS, zh: ZH_VERTICAL_KICKER_LABELS }
const DESCRIPTIONS = { ko: KO_VERTICAL_DESCRIPTIONS, zh: ZH_VERTICAL_DESCRIPTIONS }
const REGIONS = { ko: KO_REGION_LABELS, zh: ZH_REGION_LABELS }

// Localized label from the active locale's map, else the English fallback,
// never blank. `mapsByLocale` is a { ko, zh, … } bundle.
function localize(mapsByLocale, key, englishFallback, locale) {
  const map = mapsByLocale && mapsByLocale[locale]
  if (map && key != null && map[key]) return map[key]
  return englishFallback ?? (key != null ? String(key) : null)
}

export function localizeVerticalCategory(vertical, englishFallback, locale) {
  return localize(CATEGORY, vertical, englishFallback, locale)
}

// Vertical one-line descriptive blurb (region detail page section headers).
export function localizeVerticalDescription(vertical, englishFallback, locale) {
  return localize(DESCRIPTIONS, vertical, englishFallback, locale)
}

export function localizeSubcategory(rawValue, englishFallback, locale) {
  return localize(SUBCATEGORY, rawValue, englishFallback, locale)
}

export function localizeRegionName(regionName, locale) {
  return localize(REGIONS, regionName, regionName, locale)
}

// Vertical KICKER label (the short small-caps brand word on cards/heroes).
export function localizeVerticalKicker(vertical, englishFallback, locale) {
  return localize(KICKER, vertical, englishFallback, locale)
}
