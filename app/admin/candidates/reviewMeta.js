// Shared metadata for the Candidate Review surfaces (card flow + triage board).
// Moved out of CandidateReviewQueue.js so TriageBoard can consume the same
// vertical/subcategory vocabulary without a circular import.

import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

export const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

export const VERTICAL_COLORS = VERTICAL_ACCENTS

export const VERTICAL_TYPE_LABELS = {
  sba: 'Artisan Producer', collection: 'Culture', craft: 'Maker Studio',
  fine_grounds: 'Coffee', rest: 'Boutique Stay', field: 'Nature Destination',
  corner: 'Independent Shop', found: 'Vintage & Antique', table: 'Food & Produce',
  way: 'Experience Operator',
}

export const VERTICAL_FULL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas', way: 'Way Atlas',
}

// Subcategory options per vertical — values must match DB CHECK constraints on meta tables
export const SUBCATEGORY_OPTIONS = {
  sba: [
    { value: 'brewery', label: 'Brewery' },
    { value: 'winery', label: 'Winery' },
    { value: 'distillery', label: 'Distillery' },
    { value: 'cidery', label: 'Cidery' },
    { value: 'meadery', label: 'Meadery' },
    { value: 'cellar_door', label: 'Cellar Door' },
    { value: 'sour_brewery', label: 'Sour Brewery' },
    { value: 'non_alcoholic', label: 'Non-Alcoholic' },
  ],
  collection: [
    { value: 'museum', label: 'Museum' },
    { value: 'gallery', label: 'Gallery' },
    { value: 'heritage_site', label: 'Heritage Site' },
    { value: 'cultural_centre', label: 'Cultural Centre' },
    { value: 'botanical_garden', label: 'Botanical Garden' },
    { value: 'sculpture_park', label: 'Sculpture Park' },
    { value: 'cinema', label: 'Cinema' },
    { value: 'drive_in', label: 'Drive-In' },
    { value: 'live_music_venue', label: 'Live Music Venue' },
    { value: 'comedy_club', label: 'Comedy Club' },
    { value: 'theatre', label: 'Theatre' },
    { value: 'aboriginal_art_centre', label: 'Aboriginal Art Centre' },
    { value: 'artist_studio', label: 'Artist Studio' },
  ],
  craft: [
    { value: 'ceramics_clay', label: 'Ceramics & Clay' },
    { value: 'visual_art', label: 'Visual Art' },
    { value: 'jewellery_metalwork', label: 'Jewellery & Metalwork' },
    { value: 'textile_fibre', label: 'Textile & Fibre' },
    { value: 'wood_furniture', label: 'Wood & Furniture' },
    { value: 'glass', label: 'Glass' },
    { value: 'printmaking', label: 'Printmaking' },
    { value: 'leathermaker', label: 'Leatherwork' },
    { value: 'shoemaker', label: 'Shoemaking' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'fragrance_candles', label: 'Fragrance & Candles' },
    { value: 'knifemaker', label: 'Knifemaking' },
    { value: 'milliner', label: 'Millinery' },
  ],
  fine_grounds: [
    { value: 'roaster', label: 'Roaster' },
    { value: 'cafe', label: 'Cafe' },
  ],
  rest: [
    { value: 'boutique_hotel', label: 'Boutique Hotel' },
    { value: 'guesthouse', label: 'Guesthouse' },
    { value: 'bnb', label: 'B&B' },
    { value: 'farm_stay', label: 'Farm Stay' },
    { value: 'glamping', label: 'Glamping' },
    { value: 'cottage', label: 'Cottage' },
    { value: 'eco_resort', label: 'Eco Resort' },
    { value: 'heritage_hotel', label: 'Heritage Hotel' },
    { value: 'national_park_stay', label: 'National Park Stay' },
    { value: 'heritage_lighthouse', label: 'Heritage Lighthouse' },
    { value: 'off_grid_cabin', label: 'Off-Grid Cabin' },
    { value: 'houseboat', label: 'Houseboat' },
  ],
  field: [
    { value: 'swimming_hole', label: 'Swimming Hole' },
    { value: 'waterfall', label: 'Waterfall' },
    { value: 'lookout', label: 'Lookout' },
    { value: 'gorge', label: 'Gorge' },
    { value: 'coastal_walk', label: 'Coastal Walk' },
    { value: 'hot_spring', label: 'Hot Spring' },
    { value: 'cave', label: 'Cave' },
    { value: 'national_park', label: 'National Park' },
    { value: 'wildlife_zoo', label: 'Wildlife & Zoo' },
    { value: 'bush_walk', label: 'Bush Walk' },
    { value: 'botanic_garden', label: 'Botanic Garden' },
    { value: 'nature_reserve', label: 'Nature Reserve' },
    { value: 'fossicking', label: 'Fossicking & Gemfields' },
  ],
  corner: [
    { value: 'bookshop', label: 'Bookshop' },
    { value: 'records', label: 'Records & Music' },
    { value: 'homewares', label: 'Homewares & Interiors' },
    { value: 'design_store', label: 'Design Store' },
    { value: 'stationery', label: 'Stationery & Paper Goods' },
    { value: 'jewellery', label: 'Jewellery' },
    { value: 'toys', label: 'Toys & Children\'s' },
    { value: 'general', label: 'General Store' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'food_drink', label: 'Food & Drink' },
    { value: 'bottle_shop', label: 'Bottle Shop' },
    { value: 'plants', label: 'Plants' },
    { value: 'nursery', label: 'Nursery' },
    { value: 'specialty_retail', label: 'Specialty Retail' },
    { value: 'other', label: 'Other' },
  ],
  found: [
    { value: 'vintage_clothing', label: 'Vintage Clothing' },
    { value: 'vintage_furniture', label: 'Vintage Furniture' },
    { value: 'vintage_store', label: 'Vintage Store' },
    { value: 'antiques', label: 'Antiques' },
    { value: 'op_shop', label: 'Op Shop' },
    { value: 'books_ephemera', label: 'Books & Ephemera' },
    { value: 'art_objects', label: 'Art Objects' },
    { value: 'market', label: 'Market' },
  ],
  table: [
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'cafe', label: 'Cafe' },
    { value: 'bakery', label: 'Bakery' },
    { value: 'market', label: 'Market' },
    { value: 'farm_gate', label: 'Farm Gate' },
    { value: 'pick_your_own', label: 'Pick Your Own Farm' },
    { value: 'artisan_producer', label: 'Artisan Producer' },
    { value: 'specialty_retail', label: 'Specialty Retail' },
    { value: 'destination', label: 'Destination' },
    { value: 'cooking_school', label: 'Cooking School' },
    { value: 'providore', label: 'Providore' },
    { value: 'food_trail', label: 'Food Trail' },
    { value: 'creamery', label: 'Creamery' },
    { value: 'chocolatier', label: 'Chocolatier' },
    { value: 'confectioner', label: 'Confectioner' },
    { value: 'tea_shop', label: 'Tea Shop' },
    { value: 'wine_bar', label: 'Wine Bar' },
    { value: 'oyster_farm', label: 'Oyster Farm' },
    { value: 'historic_pub', label: 'Historic Pub' },
    { value: 'ice_creamery', label: 'Ice Creamery' },
    { value: 'cheesemonger', label: 'Cheesemonger' },
  ],
  // Way Atlas primary types (extends Spec §III). Order matches the spec's
  // narrative grouping: walks → cultural → flights → marine → specialist
  // → heritage → workshop → mobility.
  way: [
    { value: 'guided_walk_multiday',       label: 'Guided Walk — Multi-day' },
    { value: 'guided_walk_day',            label: 'Guided Walk — Day' },
    { value: 'cultural_tour',              label: 'Cultural Tour (Aboriginal-led)' },
    { value: 'scenic_flight',              label: 'Scenic Flight' },
    { value: 'helicopter_tour',            label: 'Helicopter Tour' },
    { value: 'sailing_charter',            label: 'Sailing Charter' },
    { value: 'sea_kayak_tour',             label: 'Sea Kayak Tour' },
    { value: 'dive_operator',              label: 'Dive Operator' },
    { value: 'fishing_guide',              label: 'Fishing Guide' },
    { value: 'photography_expedition',     label: 'Photography Expedition' },
    { value: 'specialist_natural_history', label: 'Specialist Natural History' },
    { value: 'foraging_bushfood',          label: 'Foraging & Bush Food' },
    { value: 'heritage_tour',              label: 'Heritage Tour' },
    { value: 'workshop_intensive',         label: 'Workshop Intensive' },
    { value: 'river_canoe_tour',           label: 'River & Canoe Tour' },
    { value: 'horseback_expedition',       label: 'Horseback Expedition' },
    { value: 'four_wheel_drive_expedition',label: '4WD Expedition' },
    { value: 'hot_air_balloon',            label: 'Hot Air Ballooning' },
    { value: 'marine_wildlife_swim',       label: 'Marine Wildlife Swim' },
    { value: 'whale_watching',             label: 'Whale Watching' },
    { value: 'snorkelling',                label: 'Snorkelling' },
    { value: 'surf_school',                label: 'Surf School' },
  ],
}

// ─── Triage helpers ───────────────────────────────────────

// Composite quality score for ranking: prefer the evidence-based gate score,
// fall back to classifier confidence for older candidates without gate_results.
export function scoreOf(candidate) {
  const gs = candidate.gate_results?.score
  if (gs != null) return gs
  if (candidate.confidence != null) return Math.round(candidate.confidence * 100)
  return null
}

// Same prefill rule the review card uses: gate_results.category counts only
// when it maps to a valid subcategory for the candidate's current vertical.
export function resolveSubcategory(candidate) {
  const cat = candidate.gate_results?.category
  if (!cat) return ''
  const opts = SUBCATEGORY_OPTIONS[candidate.vertical] || []
  return opts.some(o => o.value === cat) ? cat : ''
}

// Failed gates as short flags for the triage row. gate4 "warnings" render as
// passes on the card, so only hard pass:false results count here.
const GATE_FLAGS = [
  ['gate0', 'duplicate'],
  ['gate1', 'website'],
  ['gate2', 'address'],
  ['gate3', 'activity'],
  ['gate4', 'fit'],
]
export function gateFailures(candidate) {
  const gates = candidate.gate_results?.gates
  if (!gates) return []
  return GATE_FLAGS.filter(([key]) => gates[key] && gates[key].pass === false).map(([, label]) => label)
}

// A candidate can be published straight from the triage board when it needs no
// hands-on classification: Way always needs the card (mandatory editorial
// panel); other verticals need a resolvable subcategory (or have none at all).
export function isPublishReady(candidate, chosenSubcategory) {
  if (candidate.vertical === 'way') return false
  const opts = SUBCATEGORY_OPTIONS[candidate.vertical] || []
  if (opts.length === 0) return true
  return !!(chosenSubcategory || resolveSubcategory(candidate))
}

// Approve payload for a straight-from-triage publish. Identical to what the
// review card sends when the reviewer touches nothing: card defaults
// (visitable, permanent presence, no AOR/classes) + the candidate's own values
// as reviewer overrides.
export function buildTriagePayload(candidate, subcategory) {
  return {
    action: 'approve',
    subcategory: subcategory || undefined,
    address_on_request: false,
    visitable: true,
    presence_type: 'permanent',
    offers_classes: false,
    reviewerOverrides: {
      name: candidate.name || undefined,
      description: candidate.description || undefined,
      website_url: candidate.website_url || undefined,
      region: candidate.region || undefined,
      address: (candidate.address || '').trim() || undefined,
      lat: candidate.lat ?? undefined,
      lng: candidate.lng ?? undefined,
      state: candidate.state || undefined,
    },
  }
}
