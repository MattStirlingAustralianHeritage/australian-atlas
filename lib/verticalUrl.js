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
const VERTICAL_URLS = {
  sba: {
    base: 'https://smallbatchatlas.com.au', path: '/venue',
    label: 'Small Batch Atlas',
    tagline: 'Independent breweries, wineries, distilleries, and cellar doors',
    brand_colour: '#C49A3C',
  },
  collection: {
    base: 'https://collectionatlas.com.au', path: '/venue',
    label: 'Culture Atlas',
    tagline: 'Art museums, public galleries, and cultural collections',
    brand_colour: '#7A6B8A',
  },
  craft: {
    base: 'https://craftatlas.com.au', path: '/venue',
    label: 'Craft Atlas',
    tagline: 'Working maker studios, ceramicists, woodworkers, and textile artists',
    brand_colour: '#C1603A',
  },
  fine_grounds: {
    base: 'https://finegroundsatlas.com.au', path: '/roasters',  // cafes use /cafes
    label: 'Fine Grounds Atlas',
    tagline: 'Specialty coffee roasters with their own roastery',
    brand_colour: '#8A7055',
  },
  rest: {
    base: 'https://restatlas.com.au', path: '/stay',
    label: 'Rest Atlas',
    tagline: 'Boutique accommodation, B&Bs, farm stays, and eco-lodges',
    brand_colour: '#5A8A9A',
  },
  field: {
    base: 'https://fieldatlas.com.au', path: '/places',
    label: 'Field Atlas',
    tagline: 'Nature reserves, national parks, and walking trails',
    brand_colour: '#4A7C59',
  },
  corner: {
    base: 'https://corneratlas.com.au', path: '/shops',
    label: 'Corner Atlas',
    tagline: 'Independent bookshops, homewares, and design stores',
    brand_colour: '#5F8A7E',
  },
  found: {
    base: 'https://foundatlas.com.au', path: '/shops',
    label: 'Found Atlas',
    tagline: 'Vintage shops, antique dealers, and curated secondhand',
    brand_colour: '#D4956A',
  },
  table: {
    base: 'https://tableatlas.com.au', path: '/listings',
    label: 'Table Atlas',
    tagline: 'Independent restaurants, bakeries, markets, and farm gates',
    brand_colour: '#C4634F',
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
  }
  return badges[vertical] || vertical
}
