// Batched per-listing performance stats for the operator dashboard.
//
// The dashboard layout used to fire one /api/dashboard/stats request per owned
// listing; each of those scanned the pageviews table three times (30d rows,
// prev-30d count, all-time count). For an admin session — which sees every
// claimed listing — that meant ~30 serverless invocations and ~90 pageview
// scans per dashboard load. This module computes the SAME per-listing shape
// for a whole set of listings from a handful of batched queries:
//
//   - one chunked 60-day pageviews rows fetch (attributed per listing in JS,
//     powering views_30d, prev-30d, uniques, daily series, locations, devices)
//   - one .in() query each for trail stops, saves, and 30-day search
//     appearances (counted per listing in JS)
//   - per-listing all-time view counts, head-only, at bounded concurrency
//     (the only per-listing pass left; it transfers no rows)
//
// The single-listing /api/dashboard/stats route remains the source for
// one-listing consumers; keep the response shape here in lockstep with it.

// PostgREST .or() embeds values raw; only build the path filter for slugs that
// can't break the expression. Kebab-case covers every real slug.
export const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

// Matches the listing's public pages: its detail page on the vertical site
// (path ends in /{slug}, scoped to that vertical) plus the portal place page
// (/place/{slug}, including locale-prefixed variants like /ko/place/{slug}).
export function pageviewFilter(listing) {
  if (!listing.slug || !SAFE_SLUG.test(listing.slug) || !SAFE_SLUG.test(listing.vertical || '')) return null
  return `and(vertical.eq.${listing.vertical},path.like.*/${listing.slug}),and(vertical.eq.portal,path.like.*place/${listing.slug})`
}

export function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Count rows of `table` per listing_id for the given ids in ONE query.
// Row volumes here are small (analytics rows for claimed listings), so
// fetching just the listing_id column and counting in JS beats N count
// round-trips. `cap` guards the pathological case; hitting it logs loudly.
async function countByListing(sb, table, ids, { gteColumn, gteValue, cap = 100000 } = {}) {
  let q = sb.from(table).select('listing_id').in('listing_id', ids).limit(cap)
  if (gteColumn && gteValue) q = q.gte(gteColumn, gteValue)
  const { data, error } = await q
  if (error) throw error
  const counts = new Map()
  for (const row of data || []) {
    counts.set(row.listing_id, (counts.get(row.listing_id) || 0) + 1)
  }
  if ((data || []).length >= cap) {
    console.warn(`[listingStats] ${table} row fetch hit the ${cap} cap — per-listing counts may undercount`)
  }
  return counts
}

function emptyPageviewStats(now) {
  const daily = []
  for (let i = 29; i >= 0; i--) daily.push({ date: dayKey(now - i * DAY_MS), views: 0 })
  return {
    views_30d: 0,
    views_prev_30d: 0,
    views_total: 0,
    unique_visitors_30d: 0,
    daily_views: daily,
    top_locations: [],
    devices: { mobile: 0, desktop: 0, other: 0 },
  }
}

/**
 * Compute dashboard stats for a set of listings in a handful of queries.
 *
 * @param {object} sb        master-portal service-role client
 * @param {Array}  listings  [{ id, slug, vertical }]
 * @returns {Map<string, object>} listingId → stats (same shape as /api/dashboard/stats)
 */
export async function batchListingStats(sb, listings) {
  const now = Date.now()
  const ids = listings.map(l => l.id)
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString()
  const sixtyDaysAgo = new Date(now - 60 * DAY_MS).toISOString()
  const thirtyDaysAgoMs = now - 30 * DAY_MS

  const matchable = listings.filter(l => pageviewFilter(l))

  // ── 60-day pageview rows, chunked so the or() filter stays well under URL
  // limits (each listing contributes ~110 chars of filter). Newest-first with
  // a per-chunk cap: truncation drops the oldest rows first.
  const ROWS_CAP = 20000
  const rowChunks = await Promise.all(chunk(matchable, 12).map(async group => {
    const filter = group.map(pageviewFilter).join(',')
    const { data, error } = await sb
      .from('pageviews')
      .select('ts, visitor_id, city, region, country, device, vertical, path')
      .or(filter)
      .not('is_bot', 'is', true)
      .gte('ts', sixtyDaysAgo)
      .order('ts', { ascending: false })
      .limit(ROWS_CAP)
    if (error) throw error
    if ((data || []).length >= ROWS_CAP) {
      console.warn(`[listingStats] pageviews chunk hit the ${ROWS_CAP} cap — oldest days may undercount`)
    }
    return data || []
  }))

  // ── Batched activity counts + all-time views, all in parallel with each
  // other. All-time views come from ONE attributed rows fetch per chunk
  // (vertical+path only) rather than a count scan per listing — per-listing
  // traffic is far below the cap, and 30 count scans of pageviews per
  // dashboard load was the batch's dominant cost.
  const TOTAL_CAP = 50000
  const [trailCounts, saveCounts, searchCounts, allTimeChunks] = await Promise.all([
    countByListing(sb, 'trail_stops', ids),
    countByListing(sb, 'user_saves', ids),
    countByListing(sb, 'listing_search_appearances', ids, { gteColumn: 'appeared_at', gteValue: thirtyDaysAgo }),
    Promise.all(chunk(matchable, 12).map(async group => {
      const filter = group.map(pageviewFilter).join(',')
      const { data, error } = await sb
        .from('pageviews')
        .select('vertical, path')
        .or(filter)
        .not('is_bot', 'is', true)
        .limit(TOTAL_CAP)
      if (error) throw error
      if ((data || []).length >= TOTAL_CAP) {
        console.warn(`[listingStats] all-time pageviews chunk hit the ${TOTAL_CAP} cap — views_total may undercount`)
      }
      return data || []
    })),
  ])

  // ── Attribute pageview rows to listings. A row belongs to a listing when it
  // is on the listing's vertical and the path ends in /{slug}, or it is a
  // portal place page ending in place/{slug} — the JS mirror of pageviewFilter.
  const byVertical = new Map()
  for (const l of matchable) {
    if (!byVertical.has(l.vertical)) byVertical.set(l.vertical, [])
    byVertical.get(l.vertical).push(l)
  }
  const portalListings = matchable

  function attribute(row) {
    const path = row.path || ''
    if (row.vertical === 'portal') {
      for (const l of portalListings) {
        if (path.endsWith(`place/${l.slug}`)) return l.id
      }
      return null
    }
    const group = byVertical.get(row.vertical)
    if (!group) return null
    for (const l of group) {
      if (path.endsWith(`/${l.slug}`)) return l.id
    }
    return null
  }

  // All-time views per listing, attributed from the vertical+path rows.
  const totalCounts = new Map()
  for (const rows of allTimeChunks) {
    for (const row of rows) {
      const id = attribute(row)
      if (id) totalCounts.set(id, (totalCounts.get(id) || 0) + 1)
    }
  }

  const acc = new Map() // id → working aggregates
  function accFor(id) {
    let a = acc.get(id)
    if (!a) {
      a = {
        views30: 0, viewsPrev: 0, visitors: new Set(),
        daily: new Map(), locations: new Map(),
        devices: { mobile: 0, desktop: 0, other: 0 },
      }
      for (let i = 29; i >= 0; i--) a.daily.set(dayKey(now - i * DAY_MS), 0)
      acc.set(id, a)
    }
    return a
  }

  for (const rows of rowChunks) {
    for (const row of rows) {
      const id = attribute(row)
      if (!id) continue
      const a = accFor(id)
      const tsMs = new Date(row.ts).getTime()
      if (tsMs < thirtyDaysAgoMs) {
        a.viewsPrev += 1
        continue
      }
      a.views30 += 1
      const key = dayKey(row.ts)
      if (a.daily.has(key)) a.daily.set(key, a.daily.get(key) + 1)
      if (row.visitor_id) a.visitors.add(row.visitor_id)
      if (row.city || row.country) {
        // "Melbourne, VIC" for Australian traffic, "Auckland, NZ" for overseas.
        const label = row.country === 'AU'
          ? [row.city, row.region].filter(Boolean).join(', ')
          : [row.city, row.country].filter(Boolean).join(', ')
        if (label) a.locations.set(label, (a.locations.get(label) || 0) + 1)
      }
      if (row.device === 'mobile') a.devices.mobile += 1
      else if (row.device === 'desktop') a.devices.desktop += 1
      else a.devices.other += 1
    }
  }

  // ── Assemble the per-listing response shape.
  const out = new Map()
  for (const l of listings) {
    const a = acc.get(l.id)
    const base = a
      ? {
          views_30d: a.views30,
          views_prev_30d: a.viewsPrev,
          views_total: totalCounts.get(l.id) || 0,
          unique_visitors_30d: a.visitors.size,
          daily_views: [...a.daily.entries()].map(([date, views]) => ({ date, views })),
          top_locations: [...a.locations.entries()]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 5)
            .map(([label, count]) => ({ label, count })),
          devices: a.devices,
        }
      : { ...emptyPageviewStats(now), views_total: totalCounts.get(l.id) || 0 }

    out.set(l.id, {
      ...base,
      trail_count: trailCounts.get(l.id) || 0,
      search_count: searchCounts.get(l.id) || 0,
      save_count: saveCounts.get(l.id) || 0,
    })
  }
  return out
}
