// Shared query → vertical (atlas) intent detection.
//
// Used by BOTH the search API (to bias retrieval toward the obvious atlas) and
// the search page (to render the contextual header), so ranking and the header
// can never drift apart. Historically the keyword map lived only in the page and
// drove the header alone — the API ranked across every vertical, so an obvious
// single-atlas query like "quiet farm stay" surfaced wineries and farm-gates
// (token matches on "farm") above the actual Boutique Stays. Centralising the
// signal here lets the API focus retrieval the same way the header implies.
//
// Detection is substring-based, LONGEST-keyword-first, so the most specific
// signal wins ("boutique stay" beats "stay", "specialty coffee" beats "coffee").
// Keywords are the category words a searcher actually types for a vertical.

export const VERTICAL_INTENT_KEYWORDS = {
  // Small Batch — drink producers (breweries, wineries, distilleries, cellar doors)
  sba: ['brewery', 'breweries', 'winery', 'wineries', 'distillery', 'distilleries', 'cellar door', 'craft beer', 'small batch', 'wine', 'beer', 'spirits', 'gin', 'whisky', 'cider'],
  // Culture — museums, galleries, heritage, cultural places
  collection: ['art gallery', 'art galleries', 'museum', 'museums', 'gallery', 'galleries', 'heritage', 'cultural', 'exhibition'],
  // Craft — makers & studios
  craft: ['maker', 'makers', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery'],
  // Fine Grounds — coffee
  fine_grounds: ['specialty coffee', 'coffee', 'cafe', 'cafes', 'café', 'cafés', 'roaster', 'roasters', 'espresso'],
  // Rest — boutique stays & accommodation
  rest: ['bed and breakfast', 'boutique stay', 'boutique stays', 'accommodation', 'guesthouse', 'farm stay', 'farmstay', 'glamping', 'hotel', 'hotels', 'cottage', 'cottages', 'cabin', 'cabins', 'retreat', 'lodge', 'stays', 'stay', 'b&b'],
  // Field — natural places
  field: ['national park', 'swimming hole', 'bush walk', 'waterfall', 'lookout', 'hiking', 'wildlife', 'nature'],
  // Corner — independent shops
  corner: ['record store', 'bookshop', 'book shop', 'bookstore', 'homewares', 'design store', 'concept store', 'specialty shop', 'specialty retail', 'indie shop', 'nursery', 'plant nursery', 'garden centre', 'garden center', 'garden nursery'],
  // Found — vintage / secondhand
  found: ['secondhand', 'second hand', 'antique', 'antiques', 'vintage', 'op shop', 'thrift', 'retro'],
  // Table — food producers & dining
  table: ['food producer', 'farm gate', 'providore', 'restaurant', 'butcher', 'bakery', 'cheese', 'dining'],
}

// Flatten to [keyword, vertical] pairs, longest keyword first (most specific
// match wins). Computed once at module load.
const INTENT_PAIRS = (() => {
  const pairs = []
  for (const [vertical, keywords] of Object.entries(VERTICAL_INTENT_KEYWORDS)) {
    for (const kw of keywords) pairs.push([kw, vertical])
  }
  return pairs.sort((a, b) => b[0].length - a[0].length)
})()

/**
 * Detect the atlas a free-text query obviously belongs to.
 * Returns `{ vertical, keyword }` for the most specific match, or null when the
 * query carries no clear single-atlas signal (e.g. a bare place name).
 */
export function detectVerticalIntent(query) {
  if (!query || query.trim().length < 3) return null
  const lower = query.toLowerCase().trim()
  for (const [kw, vertical] of INTENT_PAIRS) {
    if (lower.includes(kw)) return { vertical, keyword: kw }
  }
  return null
}
