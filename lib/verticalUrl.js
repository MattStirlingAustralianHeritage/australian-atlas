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
// popups, explore, search, badges). All nine launched verticals are public;
// `way` is gated OFF until go-live (override locally with WAY_ATLAS_PUBLIC=true
// for end-to-end testing — see isVerticalPublic).
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
    public: false,
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
 * public surfaces. `way` is OFF until launch; WAY_ATLAS_PUBLIC=true overrides
 * it server-side only (intentionally not NEXT_PUBLIC_*, so the gate stays
 * authoritative on the server where map-payload filtering happens — client
 * components should receive the public list from a server component rather
 * than computing it in the browser).
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
