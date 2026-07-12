// The homepage type counter's vocabulary: which (vertical, sub_type) rows
// read as a countable kind of venue, and what that kind is called in the
// plural. Only kinds listed here can appear in the rotating counter — an
// unmapped sub_type never renders, so a new DB value can't leak raw keys
// (or an awkward reading like "139 general") onto the front door.
//
// `sources` lets one display kind absorb the same idea from more than one
// vertical (cafes live under both table and fine_grounds; botanic gardens
// under collection and field). `key` is the representative raw sub_type,
// which is what lib/i18n/listingLabels localizes for ko/zh.

const T = (key, plural, sources) => ({ key, plural, sources })

export const TYPE_COUNTER_TYPES = [
  // drink makers
  T('winery', 'wineries', [['sba', 'winery']]),
  T('brewery', 'breweries', [['sba', 'brewery']]),
  T('distillery', 'distilleries', [['sba', 'distillery']]),
  T('cidery', 'cideries', [['sba', 'cidery']]),
  T('meadery', 'meaderies', [['sba', 'meadery']]),
  // eating and drinking
  T('restaurant', 'restaurants', [['table', 'restaurant']]),
  T('cafe', 'cafes', [['table', 'cafe'], ['fine_grounds', 'cafe']]),
  T('bakery', 'bakeries', [['table', 'bakery']]),
  T('wine_bar', 'wine bars', [['table', 'wine_bar']]),
  T('historic_pub', 'historic pubs', [['table', 'historic_pub']]),
  T('artisan_producer', 'artisan producers', [['table', 'artisan_producer']]),
  T('farm_gate', 'farm gates', [['table', 'farm_gate']]),
  T('providore', 'providores', [['table', 'providore']]),
  T('pick_your_own', 'pick-your-own farms', [['table', 'pick_your_own']]),
  T('chocolatier', 'chocolatiers', [['table', 'chocolatier']]),
  T('creamery', 'creameries', [['table', 'creamery']]),
  T('confectioner', 'confectioners', [['table', 'confectioner']]),
  T('ice_creamery', 'ice creameries', [['table', 'ice_creamery']]),
  T('tea_shop', 'tea shops', [['table', 'tea_shop']]),
  T('market', 'markets', [['table', 'market'], ['found', 'market']]),
  T('roaster', 'coffee roasters', [['fine_grounds', 'roaster']]),
  // culture
  T('museum', 'museums', [['collection', 'museum']]),
  T('gallery', 'galleries', [['collection', 'gallery']]),
  T('heritage_site', 'heritage sites', [['collection', 'heritage_site']]),
  T('cultural_centre', 'cultural centres', [['collection', 'cultural_centre']]),
  T('botanical_garden', 'botanic gardens', [['collection', 'botanical_garden'], ['field', 'botanic_garden']]),
  // stays
  T('boutique_hotel', 'boutique hotels', [['rest', 'boutique_hotel']]),
  T('cottage', 'cottages', [['rest', 'cottage']]),
  T('glamping', 'glamping stays', [['rest', 'glamping']]),
  T('bnb', 'B&Bs', [['rest', 'bnb']]),
  T('farm_stay', 'farm stays', [['rest', 'farm_stay']]),
  T('eco_resort', 'eco resorts', [['rest', 'eco_resort']]),
  T('heritage_hotel', 'heritage hotels', [['rest', 'heritage_hotel']]),
  T('guesthouse', 'guesthouses', [['rest', 'guesthouse']]),
  // the outdoors
  T('national_park', 'national parks', [['field', 'national_park']]),
  T('lookout', 'lookouts', [['field', 'lookout']]),
  T('waterfall', 'waterfalls', [['field', 'waterfall']]),
  T('swimming_hole', 'swimming holes', [['field', 'swimming_hole']]),
  T('fossicking', 'fossicking spots', [['field', 'fossicking']]),
  T('coastal_walk', 'coastal walks', [['field', 'coastal_walk']]),
  T('cave', 'caves', [['field', 'cave']]),
  T('gorge', 'gorges', [['field', 'gorge']]),
  T('nature_reserve', 'nature reserves', [['field', 'nature_reserve']]),
  T('bush_walk', 'bush walks', [['field', 'bush_walk']]),
  T('hot_spring', 'hot springs', [['field', 'hot_spring']]),
  // shops
  T('bookshop', 'bookshops', [['corner', 'bookshop']]),
  T('nursery', 'plant nurseries', [['corner', 'nursery']]),
  T('homewares', 'homewares stores', [['corner', 'homewares']]),
  T('bottle_shop', 'bottle shops', [['corner', 'bottle_shop']]),
  T('records', 'record shops', [['corner', 'records']]),
  T('op_shop', 'op shops', [['found', 'op_shop']]),
  T('antiques', 'antiques dealers', [['found', 'antiques']]),
  T('vintage_store', 'vintage stores', [['found', 'vintage_store'], ['found', 'vintage_clothing'], ['found', 'vintage_furniture']]),
  // makers
  T('visual_art', 'artist studios', [['craft', 'visual_art']]),
  T('ceramics_clay', 'ceramics studios', [['craft', 'ceramics_clay']]),
  T('jewellery_metalwork', 'jewellers', [['craft', 'jewellery_metalwork'], ['corner', 'jewellery']]),
  T('wood_furniture', 'furniture makers', [['craft', 'wood_furniture']]),
  T('textile_fibre', 'textile studios', [['craft', 'textile_fibre']]),
  T('glass', 'glass studios', [['craft', 'glass']]),
  T('knifemaker', 'knifemakers', [['craft', 'knifemaker']]),
  T('printmaking', 'printmaking studios', [['craft', 'printmaking']]),
  T('leathermaker', 'leatherworkers', [['craft', 'leathermaker']]),
  // experiences
  T('surf_school', 'surf schools', [['way', 'surf_school']]),
  T('cultural_tour', 'cultural tours', [['way', 'cultural_tour']]),
  T('fishing_guide', 'fishing guides', [['way', 'fishing_guide']]),
  T('sea_kayak_tour', 'sea-kayak tours', [['way', 'sea_kayak_tour']]),
  T('dive_operator', 'dive operators', [['way', 'dive_operator']]),
  T('sailing_charter', 'sailing charters', [['way', 'sailing_charter']]),
  T('whale_watching', 'whale-watching tours', [['way', 'whale_watching']]),
  T('four_wheel_drive_expedition', '4WD expeditions', [['way', 'four_wheel_drive_expedition']]),
  T('guided_walk_day', 'guided walks', [['way', 'guided_walk_day'], ['way', 'guided_walk_multiday']]),
  T('helicopter_tour', 'helicopter tours', [['way', 'helicopter_tour']]),
  T('scenic_flight', 'scenic flights', [['way', 'scenic_flight']]),
  T('river_canoe_tour', 'canoe tours', [['way', 'river_canoe_tour']]),
]

// A kind only rotates once it has a real population behind it — a
// two-digit number reads as an index, a single-digit one as a gap.
const MIN_COUNT = 10

/**
 * Resolve the curated kinds against a raw `{ "vertical|sub_type": n }`
 * counts map (see getTypeCounts in app/page.js). Returns
 * [{ key, label, count }] in vocabulary order, only kinds at or above
 * the floor; callers shuffle and slice for display.
 */
export function buildTypeCounterEntries(rawCounts) {
  if (!rawCounts) return []
  return TYPE_COUNTER_TYPES
    .map(({ key, plural, sources }) => ({
      key,
      label: plural,
      count: sources.reduce((sum, [v, st]) => sum + (rawCounts[`${v}|${st}`] || 0), 0),
    }))
    .filter(e => e.count >= MIN_COUNT)
}
