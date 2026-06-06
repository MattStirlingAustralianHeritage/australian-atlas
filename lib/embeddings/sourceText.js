/**
 * Source-text construction for listing/article embeddings.
 *
 * Grounds the vector in editorial fields only — name, type, description, region
 * name, state, a presence signal, and a vertical keyword expansion. Deliberately
 * excludes phone, address, email and IDs (they dilute the semantic signal).
 * `description` is the correct source (`description_v2` is a staging column that
 * is promoted INTO `description`).
 */

const VERTICAL_KEYWORDS = {
  sba: 'craft brewery winery distillery cidery cellar door small batch',
  collection: 'museum gallery heritage cultural institution',
  craft: 'maker artist studio workshop handmade',
  fine_grounds: 'specialty coffee roaster cafe',
  rest: 'boutique accommodation stay lodge',
  field: 'nature national park walk swimming hole lookout',
  corner: 'independent shop bookshop retail',
  found: 'vintage secondhand antique market',
  table: 'food producer farm gate providore restaurant',
  way: 'tour guided experience charter cruise',
}

function presenceSignal(p) {
  if (!p || p === 'permanent') return null
  if (p === 'by_appointment') return 'by appointment'
  return String(p).replace(/_/g, ' ')
}

/**
 * @param {object} l - listing row (name, sub_type, description, region, state, vertical, presence_type)
 * @param {string|undefined} regionName - resolved region name (override-wins), falls back to l.region
 */
export function buildListingText(l, regionName) {
  return [
    l.name,
    l.sub_type ? String(l.sub_type).replace(/_/g, ' ') : null,
    l.description,
    regionName || l.region || null,
    l.state || null,
    presenceSignal(l.presence_type),
    VERTICAL_KEYWORDS[l.vertical] || null,
  ]
    .filter(Boolean)
    .join(' — ')
}

export function buildArticleText(a) {
  return [a.title, a.excerpt, a.category, VERTICAL_KEYWORDS[a.vertical] || null]
    .filter(Boolean)
    .join(' — ')
}
