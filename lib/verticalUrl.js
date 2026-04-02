// ============================================================
// Vertical URL helper
// Constructs canonical URLs for listings on their source vertical sites.
//
// The portal uses a hybrid linking model (Option C):
// - No individual listing detail pages on the portal
// - Listing cards link out to the canonical vertical page
// - Portal SEO is carried by regional pages and search, not listing pages
//
// Future (Phase 2): Portal listing pages may be added selectively for
// high-value categories (accommodation, natural places). If that happens,
// canonical tags on both portal and vertical pages will need careful handling.
// ============================================================

const VERTICAL_URLS = {
  sba:          { base: 'https://smallbatchatlas.com.au',    path: '/venue' },
  collection:   { base: 'https://collectionatlas.com.au',    path: '/venue' },
  craft:        { base: 'https://craftatlas.com.au',         path: '/venue' },
  fine_grounds: { base: 'https://finegroundsatlas.com.au',   path: '/roaster' },  // cafes use /cafe
  rest:         { base: 'https://restatlas.com.au',          path: '/stay' },
  field:        { base: 'https://fieldatlas.com.au',         path: '/places' },
  corner:       { base: 'https://corneratlas.com.au',        path: '/shop' },
  found:        { base: 'https://foundatlas.com.au',         path: '/shop' },
  table:        { base: 'https://tableatlas.com.au',         path: '/listing' },
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
    return `${config.base}/cafe/${slug}`
  }

  return `${config.base}${config.path}/${slug}`
}

/**
 * Get the vertical's display name.
 */
export function getVerticalLabel(vertical) {
  const labels = {
    sba: 'Small Batch Atlas',
    collection: 'Collection Atlas',
    craft: 'Craft Atlas',
    fine_grounds: 'Fine Grounds Atlas',
    rest: 'Rest Atlas',
    field: 'Field Atlas',
    corner: 'Corner Atlas',
    found: 'Found Atlas',
    table: 'Table Atlas',
  }
  return labels[vertical] || vertical
}

/**
 * Get a short badge label for the vertical (used on cards).
 */
export function getVerticalBadge(vertical) {
  const badges = {
    sba: 'Small Batch',
    collection: 'Collections',
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
