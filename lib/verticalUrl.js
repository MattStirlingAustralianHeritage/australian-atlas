// ============================================================
// Vertical URL helper
// Constructs URLs for listings on their source vertical sites.
//
// Since Phase 2 (April 2026), every listing has a native detail page
// on the portal at /place/[slug]. Vertical URLs are now secondary —
// used for "Also listed on [Vertical]" links and admin previews.
//
// Primary listing links throughout the portal use /place/[slug].
// ============================================================

// Single source of truth for cross-network metadata used by the cross-vertical
// line treatment on /place/[slug] and any future surface that links across
// the network. Taglines are one-line summaries derived from the authoritative
// vertical scope definitions in lib/prospector/gates.js.
//
// The `public` flag is the single go-live gate: when false the vertical is
// hidden from every public surface (homepage count + chips, map chips/markers/
// popups, explore, search, badges). All ten verticals are now live (Way joined
// 2026-06); the gate machinery stays for any future vertical launch.
const VERTICAL_URLS = {
  sba: {
    base: 'https://smallbatchatlas.com.au', path: '/venue',
    label: 'Small Batch Atlas',
    tagline: 'Independent breweries, wineries, distilleries, and cellar doors',
    brand_colour: '#C49A3C',
    public: true,
  },
  collection: {
    base: 'https://collectionatlas.com.au', path: '/venue',
    label: 'Culture Atlas',
    tagline: 'Art museums, public galleries, and cultural collections',
    brand_colour: '#7A6B8A',
    public: true,
  },
  craft: {
    base: 'https://craftatlas.com.au', path: '/venue',
    label: 'Craft Atlas',
    tagline: 'Working maker studios, ceramicists, woodworkers, and textile artists',
    brand_colour: '#C1603A',
    public: true,
  },
  fine_grounds: {
    base: 'https://finegroundsatlas.com.au', path: '/roasters',  // cafes use /cafes
    label: 'Fine Grounds Atlas',
    tagline: 'Specialty coffee roasters with their own roastery',
    brand_colour: '#8A7055',
    public: true,
  },
  rest: {
    base: 'https://restatlas.com.au', path: '/stay',
    label: 'Rest Atlas',
    tagline: 'Boutique accommodation, B&Bs, farm stays, and eco-lodges',
    brand_colour: '#5A8A9A',
    public: true,
  },
  field: {
    base: 'https://fieldatlas.com.au', path: '/places',
    label: 'Field Atlas',
    tagline: 'Nature reserves, national parks, and walking trails',
    brand_colour: '#4A7C59',
    public: true,
  },
  corner: {
    base: 'https://corneratlas.com.au', path: '/shops',
    label: 'Corner Atlas',
    tagline: 'Independent bookshops, homewares, and design stores',
    brand_colour: '#5F8A7E',
    public: true,
  },
  found: {
    base: 'https://foundatlas.com.au', path: '/shops',
    label: 'Found Atlas',
    tagline: 'Vintage shops, antique dealers, and curated secondhand',
    brand_colour: '#D4956A',
    public: true,
  },
  table: {
    base: 'https://tableatlas.com.au', path: '/listings',
    label: 'Table Atlas',
    tagline: 'Independent restaurants, bakeries, markets, and farm gates',
    brand_colour: '#C4634F',
    public: true,
  },
  way: {
    base: 'https://wayatlas.com.au', path: '/operators',
    label: 'Way Atlas',
    tagline: 'Guided walks, cultural tours, sailing charters, and adventure experiences',
    brand_colour: '#6B7A4A',
    public: true,  // Way went live network-wide 2026-06; the tenth atlas.
  },
}

/**
 * Get the full canonical URL for a listing on its vertical site.
 *
 * @param {string} vertical - The vertical identifier (e.g. 'sba', 'craft')
 * @param {string} slug - The listing's slug
 * @param {object} meta - Optional extension meta (for fine_grounds entity_type)
 * @returns {string} The full URL
 */
export function getVerticalUrl(vertical, slug, meta = {}) {
  const config = VERTICAL_URLS[vertical]
  if (!config) return '#'

  // Fine Grounds has different paths for roasters vs cafes
  if (vertical === 'fine_grounds' && meta.entity_type === 'cafe') {
    return `${config.base}/cafes/${slug}`
  }

  return `${config.base}${config.path}/${slug}`
}

/**
 * Get the vertical's display name.
 */
export function getVerticalLabel(vertical) {
  return VERTICAL_URLS[vertical]?.label || vertical
}

/**
 * Get the vertical's one-line tagline (description of what the vertical
 * covers). Used on the cross-vertical line treatment.
 */
export function getVerticalTagline(vertical) {
  return VERTICAL_URLS[vertical]?.tagline || ''
}

/**
 * Get the vertical's brand colour.
 */
export function getVerticalBrandColour(vertical) {
  return VERTICAL_URLS[vertical]?.brand_colour || null
}

/**
 * Get a short badge label for the vertical (used on cards).
 */
export function getVerticalBadge(vertical) {
  const badges = {
    sba: 'Small Batch',
    collection: 'Culture',
    craft: 'Craft',
    fine_grounds: 'Fine Grounds',
    rest: 'Rest',
    field: 'Field',
    corner: 'Corner',
    found: 'Found',
    table: 'Table',
    way: 'Way',
  }
  return badges[vertical] || vertical
}

/**
 * Go-live gate: the single source of truth for whether a vertical appears on
 * public surfaces. All ten are live; the WAY_ATLAS_PUBLIC override is kept as
 * a harmless no-op (it only ever force-ENABLES way) and as the documented
 * pattern for pre-launch testing of any future vertical.
 *
 * @param {string} vertical
 * @returns {boolean}
 */
export function isVerticalPublic(vertical) {
  const config = VERTICAL_URLS[vertical]
  if (!config) return false
  if (vertical === 'way' && process.env.WAY_ATLAS_PUBLIC === 'true') return true
  return config.public === true
}

/**
 * The ordered list of currently-public vertical keys, in canonical display
 * order. Public surfaces derive their vertical sets (counts, chips, filters,
 * ordering) from this rather than hardcoding a nine-item list.
 *
 * @returns {string[]}
 */
export function getPublicVerticals() {
  return Object.keys(VERTICAL_URLS).filter(isVerticalPublic)
}

// ============================================================
// Vertical palettes — the network's three colour systems.
// Every surface imports from here; do not redeclare these maps
// in page files (they used to be copy-pasted in 12+ places and
// drifted apart).
// ============================================================

/**
 * Bright brand accents — pills, markers, labels on light ground.
 * Mirrors each entry's `brand_colour` above.
 */
export const VERTICAL_ACCENTS = Object.fromEntries(
  Object.entries(VERTICAL_URLS).map(([key, config]) => [key, config.brand_colour])
)

/**
 * Dark typographic-card palette — the deep, vertical-specific grounds used by
 * <TypographicCard> and the photo-less card treatments. Text on these is
 * always warm cream.
 */
export const VERTICAL_CARD_TOKENS = {
  sba:          { bg: '#3D2B1F', text: '#FAF8F4', label: 'Small Batch Atlas' },
  collection:   { bg: '#2D3436', text: '#FAF8F4', label: 'Culture Atlas' },
  craft:        { bg: '#4A3728', text: '#FAF8F4', label: 'Craft Atlas' },
  fine_grounds: { bg: '#2C1810', text: '#FAF8F4', label: 'Fine Grounds Atlas' },
  rest:         { bg: '#1B2631', text: '#FAF8F4', label: 'Rest Atlas' },
  field:        { bg: '#1E3A2F', text: '#FAF8F4', label: 'Field Atlas' },
  corner:       { bg: '#3B2F2F', text: '#FAF8F4', label: 'Corner Atlas' },
  found:        { bg: '#2F2B26', text: '#FAF8F4', label: 'Found Atlas' },
  table:        { bg: '#3A2E1F', text: '#FAF8F4', label: 'Table Atlas' },
  way:          { bg: '#2D331C', text: '#FAF8F4', label: 'Way Atlas' },
  portal:       { bg: '#0f0e0c', text: '#FAF8F4', label: 'Australian Atlas' },
}

/**
 * Card backgrounds only (string map) — for surfaces that just need the
 * dark ground without text/label.
 */
export const VERTICAL_CARD_BG = Object.fromEntries(
  Object.entries(VERTICAL_CARD_TOKENS).map(([key, t]) => [key, t.bg])
)

/**
 * Muted/contextual palette — darkened tones legible as TEXT on cream
 * (the bright accents fail contrast when used for type). Used by the
 * search contextual header and vibe-search cards.
 */
export const VERTICAL_MUTED = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
  way: '#5a6b4a',
}
