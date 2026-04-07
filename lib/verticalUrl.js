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

const VERTICAL_URLS = {
  sba:          { base: 'https://smallbatchatlas.com.au',    path: '/venue' },
  collection:   { base: 'https://collectionatlas.com.au',    path: '/venue' },
  craft:        { base: 'https://craftatlas.com.au',         path: '/venue' },
  fine_grounds: { base: 'https://finegroundsatlas.com.au',   path: '/roasters' },  // cafes use /cafes
  rest:         { base: 'https://restatlas.com.au',          path: '/stay' },
  field:        { base: 'https://fieldatlas.com.au',         path: '/places' },
  corner:       { base: 'https://corneratlas.com.au',        path: '/shops' },
  found:        { base: 'https://foundatlas.com.au',         path: '/shops' },
  table:        { base: 'https://tableatlas.com.au',         path: '/listings' },
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
