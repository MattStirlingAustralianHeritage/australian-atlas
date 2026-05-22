/**
 * Seed scraper: Australian Tourism Awards national finalists & winners.
 *
 * Source: australiantourismawards.com.au/finalists-winners/
 * Rendering: server-side HTML with data attributes on every entry.
 * Rate: single-page fetch (all years/categories pre-rendered in DOM).
 *
 * Filters to Way-relevant categories only:
 *   adventure-tourism, ecotourism, cultural-tourism,
 *   aboriginal-and-torres-strait-islander-tourism-experiences,
 *   tour-transport-operators, major-tour-transport-operators,
 *   excellence-in-food-tourism
 *
 * Deduplicates by normalised operator name, keeping the highest
 * award level and most recent year per operator.
 */

const WAY_CATEGORIES = new Set([
  'adventure-tourism',
  'ecotourism',
  'cultural-tourism',
  'aboriginal-and-torres-strait-islander-tourism-experiences',
  'tour-transport-operators',
  'major-tour-transport-operators',
  'excellence-in-food-tourism',
])

const LEVEL_RANK = { gold: 5, silver: 4, bronze: 3, 'highly commended': 2, finalist: 1, 'hall of fame': 6 }

const SOURCE_URL = 'https://australiantourismawards.com.au/finalists-winners/'

/**
 * @param {object} [options]
 * @param {number[]} [options.years] — filter to specific years (default: all)
 * @param {Set<string>} [options.categories] — override WAY_CATEGORIES
 * @returns {Promise<Array<{
 *   name: string,
 *   website_url: string|null,
 *   state: string,
 *   category: string,
 *   award_level: string,
 *   award_year: number,
 *   source: string,
 * }>>}
 */
export async function scrapeTourismAwards(options = {}) {
  const categories = options.categories || WAY_CATEGORIES
  const yearFilter = options.years ? new Set(options.years.map(String)) : null

  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'AustralianAtlas-SeedScraper/1.0 (+https://australianatlas.com.au)' },
  })
  if (!res.ok) throw new Error(`Tourism Awards fetch failed: ${res.status}`)
  const html = await res.text()

  const entries = []
  const itemRe = /<div\s+class="award-item[^"]*"\s+data-category="([^"]*)"\s+data-year="([^"]*)"\s+data-level="([^"]*)"\s+data-location="([^"]*)"[^>]*>[\s\S]*?<span\s+class="title"><a\s+href="([^"]*)"[^>]*>([^<]*)<\/a><\/span>[\s\S]*?<span\s+class="location">([^<]*)<\/span>/g

  let match
  while ((match = itemRe.exec(html)) !== null) {
    const [, category, year, level, location, website, rawName, state] = match
    if (!categories.has(category)) continue
    if (yearFilter && !yearFilter.has(year)) continue

    const name = decodeHTMLEntities(rawName).trim()
    if (!name) continue

    entries.push({
      name,
      website_url: website || null,
      state: (state || location || '').toUpperCase(),
      category: category.replace(/-/g, '_'),
      award_level: level,
      award_year: Number(year),
      source: 'australian_tourism_awards',
    })
  }

  return dedup(entries)
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

function dedup(entries) {
  const map = new Map()
  for (const e of entries) {
    const key = e.name.toLowerCase().trim()
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...e, categories: [e.category], years: [e.award_year] })
      continue
    }
    if (!existing.categories.includes(e.category)) existing.categories.push(e.category)
    if (!existing.years.includes(e.award_year)) existing.years.push(e.award_year)
    if ((LEVEL_RANK[e.award_level] || 0) > (LEVEL_RANK[existing.award_level] || 0)) {
      existing.award_level = e.award_level
    }
    if (e.award_year > existing.award_year) {
      existing.award_year = e.award_year
      if (e.website_url) existing.website_url = e.website_url
    }
  }
  return [...map.values()]
}

// Direct execution: print sample
if (process.argv[1] && process.argv[1].includes('scrape-tourism-awards')) {
  const entries = await scrapeTourismAwards()
  console.log(`\n=== Australian Tourism Awards: ${entries.length} Way-relevant operators ===\n`)
  const sample = entries.slice(0, 10)
  for (const e of sample) {
    console.log(`  ${e.name}`)
    console.log(`    website:  ${e.website_url || '(none)'}`)
    console.log(`    state:    ${e.state}`)
    console.log(`    category: ${e.categories ? e.categories.join(', ') : e.category}`)
    console.log(`    best:     ${e.award_level} (${e.award_year})`)
    console.log(`    years:    ${e.years ? e.years.join(', ') : e.award_year}`)
    console.log()
  }
  console.log(`(showing 10 of ${entries.length})`)
}
