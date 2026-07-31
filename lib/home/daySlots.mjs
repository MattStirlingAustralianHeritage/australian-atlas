// ─────────────────────────────────────────────────────────────────
// Which listings can carry a slot in the homepage worked day.
//
// trail_suitable answers "can you walk in?" — a shopfront question.
// The day rail poses a narrower editorial one: "would a visitor plan
// a morning around this?" A furniture maker with a showroom is
// genuinely visitable — you go there to buy a table — but nobody
// structures a day trip around it, so it never carries a slot. Same
// for the trade end of the corner vertical (nurseries, bottle shops)
// and the evening end of collection (cinemas, drive-ins).
// ─────────────────────────────────────────────────────────────────

// Craft a visitor browses like a gallery: art spaces, ceramics and
// glass studios with showrooms, print studios. Commission-led makers
// — furniture, jewellery, leather, shoes, textiles, clothing — are
// destinations for buyers, not for a day out.
export const CRAFT_BROWSE = ['visual_art', 'ceramics_clay', 'glass', 'printmaking']

// The browsy end of corner. Nurseries and bottle shops dominate the
// vertical by count but are supply runs, not stops.
export const CORNER_BROWSE = ['bookshop', 'records', 'general']

// Daytime collection venues only.
export const COLLECTION_DAY = [
  'museum', 'gallery', 'heritage_site', 'cultural_centre',
  'botanical_garden', 'sculpture_park', 'archive',
]

// Breakfast from the table vertical when a region has no coffee
// listing: the bakery, the market, the providore.
export const MORNING_TABLE = ['bakery', 'market', 'providore']

// Lunch venues named by sub_types that exist in the data — the old
// list reached for 'pub' and 'bistro', which no row carries (the
// live sub_type is 'historic_pub'). No bakery here: bakeries belong
// to the morning list, and keeping the two table lists disjoint is
// what lets both slots draw from the same vertical (below) without
// ever seating one venue twice.
export const TABLE_LUNCH = ['restaurant', 'cafe', 'historic_pub', 'wine_bar']

// Day order for a worked day: coffee, an activity before lunch,
// lunch, then ONE main activity for the afternoon, a tasting, a bed.
// Each slot takes the first vertical that still has an unused,
// well-described candidate, so the day degrades gracefully if the
// region thins out. A vertical is never used twice in one day.
// Labels are time-of-day, from the existing translated keys.
// The two table prefs are marked shared so the vertical-reuse rule
// steps aside for them alone: in a region with no coffee listing the
// morning falls through to a bakery breakfast, and that must not cost
// the day its lunch (the old rule consumed 'table' at breakfast, so
// Hunter Valley's day had no midday stop at all). Their sub_type
// lists are disjoint, so the two slots can never seat the same venue.
export const DAY_TRIP_SLOTS = [
  { slot: 'morning',    labelKey: 'clusterStopMorning',   prefs: [['fine_grounds'], ['table', MORNING_TABLE, { shared: true }]] },
  { slot: 'midmorning', labelKey: 'tripStopMidMorning',   prefs: [['craft', CRAFT_BROWSE], ['corner', CORNER_BROWSE], ['found'], ['collection', COLLECTION_DAY], ['field']] },
  // Lunch comes from the table vertical or not at all: the old last
  // resort reached into corner, which could seat the reader's lunch
  // at a plant nursery.
  { slot: 'midday',     labelKey: 'clusterStopMidday',    prefs: [['table', TABLE_LUNCH, { shared: true }]] },
  // Way Atlas listings are deliberately left out of the worked-day
  // example (the afternoon reaches for the outdoors, then craft/culture
  // instead). The exclusion is also enforced at the query in
  // assembleRegionDay so no Way venue can slip into a stop.
  { slot: 'afternoon',  labelKey: 'clusterStopAfternoon', prefs: [['field'], ['collection', COLLECTION_DAY], ['craft', CRAFT_BROWSE], ['corner', CORNER_BROWSE]] },
  { slot: 'tasting',    labelKey: 'tripStopTasting',      prefs: [['sba'], ['fine_grounds']] },
  { slot: 'stay',       labelKey: 'clusterStopStay',      prefs: [['rest']] },
]

// True when a listing's vertical + sub_type can carry at least one
// slot. The claimed showcase checks this before spending an hour on a
// region: boosting a claimed jewellery workshop is wasted — no slot
// will seat it — so its region shouldn't be drawn as a showcase.
export function slotEligible(listing) {
  if (!listing) return false
  for (const { prefs } of DAY_TRIP_SLOTS) {
    for (const [v, subTypes] of prefs) {
      if (listing.vertical !== v) continue
      if (!subTypes || subTypes.includes(listing.sub_type)) return true
    }
  }
  return false
}
