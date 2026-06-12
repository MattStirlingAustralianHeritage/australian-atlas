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
 * Flatten listings.operator_highlights into plain searchable text: the hiring
 * note (+ the literal "now hiring" when the toggle is on) and every
 * text/textarea/list field value. URL values are excluded — they dilute the
 * signal the same way website/phone would. Mirrors the SQL helper
 * operator_highlights_search_text() (migration 159) so the lexical and
 * semantic arms see the same document.
 */
export function highlightsText(h) {
  if (!h || typeof h !== 'object') return null
  const parts = []
  if (h.hiring && h.hiring.open === true) parts.push('now hiring')
  if (h.hiring && h.hiring.note) parts.push(String(h.hiring.note).trim())
  for (const value of Object.values(h.fields || {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const s = String(item ?? '').trim()
      if (s && !/^(https?:\/\/|www\.)/i.test(s)) parts.push(s)
    }
  }
  return parts.length ? parts.join(' — ') : null
}

/**
 * @param {object} l - listing row (name, sub_type, description, region, state, vertical, presence_type, operator_highlights)
 * @param {string|undefined} regionName - resolved region name (override-wins), falls back to l.region
 */
export function buildListingText(l, regionName) {
  return [
    l.name,
    l.sub_type ? String(l.sub_type).replace(/_/g, ' ') : null,
    l.description,
    highlightsText(l.operator_highlights),
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
