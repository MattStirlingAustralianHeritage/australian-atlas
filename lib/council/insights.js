import { isBot } from '@/lib/analytics/aggregate'
import { buildSearchTermMatcher } from '@/lib/analytics/regionMetrics'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'

// Council intelligence layer — weekly trends, search-demand insights, digital
// presence audit, and peer benchmarking. Pure JS aggregation over the same
// bot-filtered pageviews/search_logs windows the region metrics use: no DDL,
// and every function is shared by /api/council/data and the monthly digest
// cron so the dashboard and the email can never disagree.

const PAGE_SIZE = 1000

async function fetchAll(query, { pageSize = PAGE_SIZE, max = 40000 } = {}) {
  const rows = []
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

// Pageviews scoped to a path prefix. is_bot=false narrows at the DB (backfilled
// by migrations 141/178); isBot() re-checks in JS so parity with the metrics
// pipeline holds even for rows written before UA capture.
async function fetchPrefixedPageviews(sb, prefix, since, cols = 'ts, path, city, region, country, lat, lng, visitor_id, user_agent') {
  const rows = await fetchAll(
    sb.from('pageviews')
      .select(cols)
      .gte('ts', since)
      .eq('is_bot', false)
      .like('path', `${prefix}%`)
      .order('id', { ascending: true }),
  )
  return rows.filter((r) => !isBot(r))
}

async function fetchRegionListingRows(sb, regionId, select) {
  return fetchAll(
    excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select(select)
        .eq('status', 'active')
        .eq('region_id', regionId),
    )).order('slug', { ascending: true }),
  )
}

const slugFromPath = (path, prefix) => {
  if (!path?.startsWith(prefix)) return null
  return path.slice(prefix.length).split(/[/?#]/)[0] || null
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Monday-anchored week bucket for a timestamp.
function weekStartISO(ts) {
  const d = new Date(ts)
  const day = (d.getUTCDay() + 6) % 7 // Mon=0
  d.setUTCDate(d.getUTCDate() - day)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function weekBuckets(sinceISO, untilISO) {
  const buckets = []
  let cur = new Date(weekStartISO(sinceISO))
  const until = new Date(untilISO)
  while (cur <= until) {
    buckets.push(cur.toISOString())
    cur = new Date(cur.getTime() + 7 * 86400000)
  }
  return buckets
}

const norm = (s) => (s || '').trim().toLowerCase()

/**
 * Weekly views/clicks trend + previous-period deltas + local-vs-visiting split
 * for a council's managed regions.
 *
 * "Views" are the region's own page (/regions/{slug}); "clicks" are place-page
 * views (/place/{slug}) for venues attributed to the region — same definitions
 * as computeRegionMetrics, bucketed by ISO week.
 */
export async function computeWeeklyTrends(sb, regions, { rangeDays = 90 } = {}) {
  const now = Date.now()
  const since = new Date(now - rangeDays * 86400000).toISOString()
  const prevSince = new Date(now - 2 * rangeDays * 86400000).toISOString()

  // One shared fetch across all managed regions (covers current + previous window).
  const [placeRows, regionRows] = await Promise.all([
    fetchPrefixedPageviews(sb, '/place/', prevSince),
    fetchPrefixedPageviews(sb, '/regions/', prevSince),
  ])

  // slug → region attribution + suburb sets for the locality heuristic.
  const perRegionData = await Promise.all(regions.map(async (region) => {
    const listings = await fetchRegionListingRows(sb, region.id, 'slug, suburb')
    const slugs = new Set(listings.map((l) => l.slug))
    const suburbs = new Set(listings.map((l) => norm(l.suburb)).filter(Boolean))
    return { region, slugs, suburbs }
  }))

  const buckets = weekBuckets(since, new Date(now).toISOString())
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]))
  const sinceMs = Date.parse(since)

  const byRegion = perRegionData.map(({ region, slugs, suburbs }) => {
    const series = buckets.map((weekStart) => ({ weekStart, views: 0, clicks: 0 }))
    const current = { views: 0, clicks: 0 }
    const previous = { views: 0, clicks: 0 }
    const split = { local: 0, visiting: 0, unknown: 0 }
    const visitorIds = new Set()

    const isLocal = (row) => {
      if (suburbs.has(norm(row.city))) return true
      if (row.lat != null && row.lng != null && region.center_lat != null && region.center_lng != null) {
        return haversineKm(row.lat, row.lng, region.center_lat, region.center_lng) <= 40
      }
      return null // unknown
    }

    const tally = (row, kind) => {
      const inCurrent = Date.parse(row.ts) >= sinceMs
      if (inCurrent) {
        current[kind] += 1
        const idx = bucketIndex.get(weekStartISO(row.ts))
        if (idx != null) series[idx][kind] += 1
        if (row.visitor_id) visitorIds.add(row.visitor_id)
        if (row.city || row.lat != null) {
          const local = isLocal(row)
          if (local === true) split.local += 1
          else if (local === false) split.visiting += 1
          else split.unknown += 1
        } else {
          split.unknown += 1
        }
      } else {
        previous[kind] += 1
      }
    }

    for (const row of regionRows) {
      if (slugFromPath(row.path, '/regions/') === region.slug) tally(row, 'views')
    }
    for (const row of placeRows) {
      const slug = slugFromPath(row.path, '/place/')
      if (slug && slugs.has(slug)) tally(row, 'clicks')
    }

    return {
      region: { id: region.id, slug: region.slug, name: region.name, state: region.state },
      series,
      current: { ...current, visitors: visitorIds.size },
      previous,
      split,
    }
  })

  // Council-wide rollup (sum of the managed regions).
  const series = buckets.map((weekStart, i) => ({
    weekStart,
    views: byRegion.reduce((s, r) => s + r.series[i].views, 0),
    clicks: byRegion.reduce((s, r) => s + r.series[i].clicks, 0),
  }))
  const sum = (key, from) => byRegion.reduce((s, r) => s + (r[from][key] || 0), 0)

  return {
    rangeDays,
    since,
    prevSince,
    series,
    current: { views: sum('views', 'current'), clicks: sum('clicks', 'current'), visitors: sum('visitors', 'current') },
    previous: { views: sum('views', 'previous'), clicks: sum('clicks', 'previous') },
    byRegion,
  }
}

/**
 * Search-demand insights: what people searched for that relates to each region,
 * what's trending vs the previous period, and — the part no spend-data product
 * can see — queries that found nothing (unmet demand / product gaps).
 */
export async function computeSearchInsights(sb, regions, { rangeDays = 90 } = {}) {
  const now = Date.now()
  const since = new Date(now - rangeDays * 86400000).toISOString()
  const prevSince = new Date(now - 2 * rangeDays * 86400000).toISOString()

  const rows = await fetchAll(
    sb.from('search_logs')
      .select('query_text, result_count, created_at')
      .gte('created_at', prevSince)
      .order('created_at', { ascending: true }),
  )

  const byRegion = await Promise.all(regions.map(async (region) => {
    const listings = await fetchRegionListingRows(sb, region.id, 'slug, suburb')
    const suburbs = [...new Set(listings.map((l) => l.suburb).filter(Boolean))]
    const matcher = buildSearchTermMatcher(region.name, suburbs)

    const cur = new Map() // query → { count, results: [counts] }
    const prev = new Map()
    for (const row of rows) {
      const q = norm(row.query_text)
      if (!q || !matcher.test(q)) continue
      const target = Date.parse(row.created_at) >= Date.parse(since) ? cur : prev
      const entry = target.get(q) || { count: 0, results: [] }
      entry.count += 1
      if (typeof row.result_count === 'number') entry.results.push(row.result_count)
      target.set(q, entry)
    }

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
    const entries = [...cur.entries()].map(([query, e]) => ({
      query,
      count: e.count,
      avgResults: avg(e.results),
    }))

    const topQueries = entries.slice().sort((a, b) => b.count - a.count).slice(0, 12)
    // Unmet demand: searches that named this region/its towns and found little
    // or nothing. avgResults===null (no result data) is excluded — only report
    // gaps we can substantiate.
    const gaps = entries
      .filter((e) => e.avgResults != null && e.avgResults < 3)
      .sort((a, b) => (a.avgResults - b.avgResults) || (b.count - a.count))
      .slice(0, 10)
    const trending = entries
      .filter((e) => e.count >= 3)
      .map((e) => {
        const before = prev.get(e.query)?.count || 0
        return { ...e, before, growth: before === 0 ? null : (e.count - before) / before }
      })
      .filter((e) => e.before === 0 || e.growth > 0.5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    return {
      region: { id: region.id, slug: region.slug, name: region.name },
      searchTerms: matcher.terms,
      totalSearches: entries.reduce((s, e) => s + e.count, 0),
      previousSearches: [...prev.values()].reduce((s, e) => s + e.count, 0),
      topQueries,
      trending,
      gaps,
    }
  }))

  return { rangeDays, since, byRegion }
}

const DEAD_STATUSES = new Set(['down', 'error'])

/**
 * Digital presence audit per region: which local venues have no website, a dead
 * website, no imagery, or are unclaimed. This is the exportable hit-list a
 * council's small-business / digital-capability program works from.
 */
export async function computePresenceAudit(sb, regions) {
  const byRegion = await Promise.all(regions.map(async (region) => {
    const rows = await fetchRegionListingRows(
      sb, region.id,
      'slug, name, vertical, suburb, website, website_status, website_checked_at, is_claimed, hero_image_url',
    )
    // One row per venue (cross-vertical venues appear once per vertical in the view).
    const seen = new Map()
    for (const r of rows) if (!seen.has(r.slug)) seen.set(r.slug, r)
    const venues = [...seen.values()]

    const noWebsite = venues.filter((v) => !v.website)
    const deadWebsite = venues.filter((v) => v.website && DEAD_STATUSES.has(v.website_status))
    const noImage = venues.filter((v) => !v.hero_image_url)
    const claimed = venues.filter((v) => v.is_claimed)

    const toRow = (v) => ({ slug: v.slug, name: v.name, vertical: v.vertical, suburb: v.suburb, website: v.website || null, websiteStatus: v.website_status || null })

    return {
      region: { id: region.id, slug: region.slug, name: region.name },
      total: venues.length,
      claimed: claimed.length,
      noWebsite: { count: noWebsite.length, rows: noWebsite.slice(0, 100).map(toRow) },
      deadWebsite: { count: deadWebsite.length, rows: deadWebsite.slice(0, 100).map(toRow) },
      noImage: { count: noImage.length },
      score: venues.length
        ? Math.round(100 * (1 - (noWebsite.length + deadWebsite.length) / venues.length))
        : null,
    }
  }))
  return { byRegion }
}

/**
 * Peer benchmarking: where each managed region sits among ALL live Atlas
 * regions on visitor interest. One shared pass over the same pageview window —
 * cross-region comparison is the structural advantage of a network-wide DB.
 */
export async function computeBenchmarks(sb, regions, { rangeDays = 90 } = {}) {
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString()

  const [liveRegions, allListings, placeRows, regionRows] = await Promise.all([
    fetchAll(sb.from('regions').select('id, slug, name').eq('status', 'live').order('slug')),
    fetchAll(
      excludeNeedsReview(excludeTestListings(
        sb.from('listings_with_region').select('slug, region_id').eq('status', 'active'),
      )).order('slug', { ascending: true }),
    ),
    fetchPrefixedPageviews(sb, '/place/', since, 'ts, path, country, city, user_agent'),
    fetchPrefixedPageviews(sb, '/regions/', since, 'ts, path, country, city, user_agent'),
  ])

  // slug → region_id (first attribution wins; cross-vertical dupes share a slug)
  const slugRegion = new Map()
  const listingCounts = new Map()
  for (const l of allListings) {
    if (!slugRegion.has(l.slug)) {
      slugRegion.set(l.slug, l.region_id)
      if (l.region_id) listingCounts.set(l.region_id, (listingCounts.get(l.region_id) || 0) + 1)
    }
  }
  const regionBySlug = new Map(liveRegions.map((r) => [r.slug, r.id]))

  const stats = new Map(liveRegions.map((r) => [r.id, { views: 0, clicks: 0 }]))
  for (const row of regionRows) {
    const id = regionBySlug.get(slugFromPath(row.path, '/regions/'))
    if (id && stats.has(id)) stats.get(id).views += 1
  }
  for (const row of placeRows) {
    const id = slugRegion.get(slugFromPath(row.path, '/place/'))
    if (id && stats.has(id)) stats.get(id).clicks += 1
  }

  const table = liveRegions.map((r) => {
    const s = stats.get(r.id)
    const listings = listingCounts.get(r.id) || 0
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      listings,
      views: s.views,
      clicks: s.clicks,
      interest: s.views + s.clicks,
      clicksPerListing: listings > 0 ? s.clicks / listings : 0,
    }
  })

  const ranked = table.slice().sort((a, b) => b.interest - a.interest)
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const medians = {
    views: median(table.map((t) => t.views)),
    clicks: median(table.map((t) => t.clicks)),
    listings: median(table.map((t) => t.listings)),
    clicksPerListing: median(table.map((t) => t.clicksPerListing)),
  }

  const byRegion = regions.map((region) => {
    const idx = ranked.findIndex((t) => t.id === region.id)
    const mine = idx >= 0 ? ranked[idx] : null
    return {
      region: { id: region.id, slug: region.slug, name: region.name },
      rank: idx >= 0 ? idx + 1 : null,
      of: ranked.length,
      percentile: idx >= 0 && ranked.length > 1 ? Math.round(100 * (1 - idx / (ranked.length - 1))) : null,
      views: mine?.views ?? 0,
      clicks: mine?.clicks ?? 0,
      listings: mine?.listings ?? 0,
      clicksPerListing: mine ? Number(mine.clicksPerListing.toFixed(2)) : 0,
    }
  })

  return { rangeDays, since, medians, totalRegions: ranked.length, byRegion }
}
