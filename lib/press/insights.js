// lib/press/insights.js
// The Newsroom's data engine: region fact sheets, network overview, recent
// additions, events-for-regions, rule-based story signals, and CSV builders.
//
// Every number here is a live DB count over public listings — the same rows
// the site renders. Composition is entirely RULE-BASED (house discipline: no
// model writes copy for outbound or citable surfaces); anything phrased is a
// template filled with real values. All reads go through the passed-in
// service-role client and honour the canonical public-visibility filters
// (lib/listings/publicFilter + the events applyPublic rule).

import { getVerticalLabel, getPublicVerticals } from '@/lib/verticalUrl'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'

const ROW_CAP = 10000
const DAY_MS = 24 * 60 * 60 * 1000

// Canonical vertical order for press surfaces — derived from the network
// config so a future vertical launch propagates automatically.
export const PRESS_VERTICALS = getPublicVerticals()

export function verticalName(key) {
  return getVerticalLabel(key) || key || ''
}

export const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

export function stateName(code) {
  return STATE_NAMES[code] || code || ''
}

// Anniversaries worth a diary note: decades to 50, then quarter-centuries.
const ANNIVERSARY_YEARS = new Set([10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 175, 200])

// Region listing-count milestones — signalled only when the region crossed
// one inside the window (count >= m, and count minus the window's additions
// was below it).
const COUNT_MILESTONES = [25, 50, 100, 150, 200, 250, 500, 1000]

function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Public listings only — the canonical chain every public surface uses.
export function applyPublicListings(q) {
  return excludeNeedsReview(excludeTestListings(q)).eq('status', 'active')
}

// Supabase clamps every select to 1,000 rows regardless of .limit() — a
// multi-region read that trusts one query silently truncates (the sync
// pagination-cap trap). buildQuery must return a FRESH builder per page.
export async function fetchAllRows(buildQuery, { pageSize = 1000, cap = ROW_CAP } = {}) {
  const out = []
  for (let from = 0; from < cap; from += pageSize) {
    const { data, error } = await buildQuery().range(from, Math.min(from + pageSize, cap) - 1)
    if (error) break
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return out
}

// Publicly visible events (same rule as lib/events applyPublic).
function applyPublicEvents(q) {
  return q.eq('status', 'approved').not('published', 'is', false)
}

// ── Followed regions ───────────────────────────────────────────────────────

export async function getFollowedRegions(sb, pressId) {
  const { data } = await sb
    .from('press_follows')
    .select('region_id, created_at, region:regions ( id, slug, name, state, listing_count, status, center_lat, center_lng, map_zoom, hero_image_url )')
    .eq('press_id', pressId)
  return (data || [])
    .map(r => r.region)
    .filter(r => r && r.status === 'live')
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Region fact sheet — the citable per-region numbers ─────────────────────

export async function regionFactSheet(sb, region) {
  const since90 = isoDaysAgo(90)
  const since30 = isoDaysAgo(30)

  const listings = await fetchAllRows(() => applyPublicListings(
    sb.from('listings_with_region')
      .select('id, name, slug, vertical, suburb, created_at, is_claimed, editors_pick, founded_year, sub_type')
      .eq('region_id', region.id)
  ).order('id'))

  const byVertical = {}
  for (const key of PRESS_VERTICALS) byVertical[key] = 0
  let claimed = 0
  let new90 = 0
  let new30 = 0
  const recent = []

  for (const l of listings) {
    if (l.vertical && byVertical[l.vertical] !== undefined) byVertical[l.vertical] += 1
    if (l.is_claimed) claimed += 1
    if (l.created_at >= since90) new90 += 1
    if (l.created_at >= since30) {
      new30 += 1
      recent.push(l)
    }
  }
  recent.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  const { count: upcomingEvents } = await applyPublicEvents(
    sb.from('events').select('id', { count: 'exact', head: true }).eq('region_id', region.id)
  ).gte('end_date', todayYMD())

  return {
    region: {
      id: region.id, slug: region.slug, name: region.name, state: region.state,
      center_lat: region.center_lat ?? null, center_lng: region.center_lng ?? null,
      map_zoom: region.map_zoom ?? null, hero_image_url: region.hero_image_url ?? null,
    },
    asOf: new Date().toISOString().slice(0, 10),
    total: listings.length,
    byVertical,
    claimed,
    new30,
    new90,
    upcomingEvents: upcomingEvents || 0,
    recentAdditions: recent.slice(0, 6).map(l => ({
      id: l.id, name: l.name, slug: l.slug, vertical: l.vertical, suburb: l.suburb, created_at: l.created_at,
    })),
  }
}

// ── Network overview — the headline numbers ────────────────────────────────

export async function networkOverview(sb) {
  const [listingsRes, regionsRes, new30Res, eventsRes] = await Promise.all([
    applyPublicListings(sb.from('listings').select('id', { count: 'exact', head: true })),
    sb.from('regions').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    applyPublicListings(sb.from('listings').select('id', { count: 'exact', head: true })).gte('created_at', isoDaysAgo(30)),
    applyPublicEvents(sb.from('events').select('id', { count: 'exact', head: true })).gte('end_date', todayYMD()),
  ])
  return {
    asOf: new Date().toISOString().slice(0, 10),
    listings: listingsRes.count || 0,
    liveRegions: regionsRes.count || 0,
    newListings30: new30Res.count || 0,
    upcomingEvents: eventsRes.count || 0,
    verticals: PRESS_VERTICALS.length,
  }
}

// ── Recent additions across a set of regions ───────────────────────────────

export async function listRecentAdditions(sb, { regionIds = [], sinceDays = 30, limit = 40 } = {}) {
  if (!regionIds.length) return []
  const { data } = await applyPublicListings(
    sb.from('listings_with_region')
      .select('id, name, slug, vertical, suburb, state, created_at, region_id, hero_image_url, sub_type')
      .in('region_id', regionIds)
  )
    .gte('created_at', isoDaysAgo(sinceDays))
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ── Upcoming events across a set of regions ────────────────────────────────
// beats: optional vertical keys — events tagged with any of them pass, as do
// untagged events (an empty verticals[] never hides an event from a beat).

export async function listEventsForRegions(sb, { regionIds = [], beats = [], limit = 60 } = {}) {
  if (!regionIds.length) return []
  const { data } = await applyPublicEvents(
    sb.from('events')
      .select('id, name, slug, description, category, category_label, start_date, end_date, location_name, suburb, state, address, ticket_url, website_url, image_url, is_free, region_id, verticals, listing_id, listing:listings ( id, name, slug, vertical, suburb )')
      .in('region_id', regionIds)
  )
    .gte('end_date', todayYMD())
    .order('start_date', { ascending: true })
    .limit(limit)
  const rows = data || []
  if (!beats.length) return rows
  return rows.filter(e => !e.verticals?.length || e.verticals.some(v => beats.includes(v)))
}

// ── Story signals — rule-based angles worth a journalist's minute ──────────
// Five kinds, all computed from real rows:
//   new_cluster   — ≥3 places added to a region inside 30 days
//   milestone     — a region crossed a listing-count milestone inside 30 days
//   first_of_kind — a region got its FIRST listing of a category inside 30 days
//   events_cluster— ≥3 upcoming events in one region (a what's-on feature)
//   anniversary   — a listed place hits a round founding anniversary this year
//   heritage      — a heritage-significant place joined recently

export async function computeStorySignals(sb, regions) {
  if (!regions.length) return []
  const since30 = isoDaysAgo(30)
  const thisYear = new Date().getFullYear()
  const regionById = new Map(regions.map(r => [r.id, r]))
  const regionIds = regions.map(r => r.id)

  const [listings, upcomingEvents] = await Promise.all([
    fetchAllRows(() => applyPublicListings(
      sb.from('listings_with_region')
        .select('id, name, slug, vertical, suburb, created_at, founded_year, heritage_significance, region_id')
        .in('region_id', regionIds)
    ).order('id')),
    listEventsForRegions(sb, { regionIds, limit: 200 }),
  ])

  const signals = []

  // Per-region tallies
  const totals = new Map()
  const recentByRegion = new Map()
  const verticalTotals = new Map() // regionId → Map(vertical → count)
  for (const l of listings) {
    totals.set(l.region_id, (totals.get(l.region_id) || 0) + 1)
    if (!verticalTotals.has(l.region_id)) verticalTotals.set(l.region_id, new Map())
    if (l.vertical) {
      const vt = verticalTotals.get(l.region_id)
      vt.set(l.vertical, (vt.get(l.vertical) || 0) + 1)
    }
    if (l.created_at >= since30) {
      if (!recentByRegion.has(l.region_id)) recentByRegion.set(l.region_id, [])
      recentByRegion.get(l.region_id).push(l)
    }
  }

  for (const [regionId, recent] of recentByRegion) {
    const region = regionById.get(regionId)
    if (!region) continue

    recent.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    if (recent.length >= 3) {
      const verticals = [...new Set(recent.map(l => l.vertical).filter(Boolean))]
      signals.push({
        kind: 'new_cluster',
        regionId,
        regionName: region.name,
        headline: `${recent.length} places joined the ${region.name} atlas in the last 30 days`,
        detail: verticals.length
          ? `Across ${verticals.map(v => verticalName(v)).join(', ')}. Newest: ${recent[0].name}${recent[0].suburb ? ` (${recent[0].suburb})` : ''}.`
          : `Newest: ${recent[0].name}.`,
        items: recent.slice(0, 6).map(l => ({ name: l.name, slug: l.slug, vertical: l.vertical, suburb: l.suburb })),
      })
    }

    // Region crossed a count milestone within the window — report the
    // largest one crossed, not the first.
    const total = totals.get(regionId) || 0
    const before = total - recent.length
    const crossed = [...COUNT_MILESTONES].reverse().find(m => total >= m && before < m)
    if (crossed) {
      signals.push({
        kind: 'milestone',
        regionId,
        regionName: region.name,
        headline: `${region.name} passed ${crossed} independent places on Australian Atlas`,
        detail: `${total} listed as of today — each one independently run, no chains.`,
        items: [],
      })
    }

    // First of its kind: the region's first listing in a category arrived
    // inside the window ("the region's first listed distillery").
    const vt = verticalTotals.get(regionId) || new Map()
    for (const l of recent) {
      if (l.vertical && vt.get(l.vertical) === 1) {
        signals.push({
          kind: 'first_of_kind',
          regionId,
          regionName: region.name,
          headline: `${region.name}'s first listing under ${verticalName(l.vertical)}: ${l.name}`,
          detail: `The first place of its kind our editors have listed in ${region.name}${l.suburb ? ` — ${l.suburb}` : ''}.`,
          items: [{ name: l.name, slug: l.slug, vertical: l.vertical, suburb: l.suburb }],
        })
      }
    }
  }

  // Events clusters: a busy month is a what's-on feature waiting to happen.
  const eventsByRegion = new Map()
  for (const e of upcomingEvents) {
    if (!eventsByRegion.has(e.region_id)) eventsByRegion.set(e.region_id, [])
    eventsByRegion.get(e.region_id).push(e)
  }
  for (const [regionId, evs] of eventsByRegion) {
    const region = regionById.get(regionId)
    if (!region || evs.length < 3) continue
    signals.push({
      kind: 'events_cluster',
      regionId,
      regionName: region.name,
      headline: `${evs.length} events coming up across ${region.name}`,
      detail: `Next: ${evs[0].name}${evs[0].start_date ? ` (${evs[0].start_date})` : ''} at ${evs[0].location_name || 'a listed independent'}. A ready-made what's-on column.`,
      items: evs.slice(0, 5).map(e => ({ name: e.name, slug: e.slug, isEvent: true })),
    })
  }

  // Anniversaries: round founding years landing this calendar year.
  const anniversaries = listings
    .filter(l => l.founded_year && ANNIVERSARY_YEARS.has(thisYear - l.founded_year))
    .sort((a, b) => a.founded_year - b.founded_year)
  for (const l of anniversaries.slice(0, 8)) {
    const region = regionById.get(l.region_id)
    signals.push({
      kind: 'anniversary',
      regionId: l.region_id,
      regionName: region?.name || null,
      headline: `${l.name} turns ${thisYear - l.founded_year} this year`,
      detail: `Founded ${l.founded_year}${l.suburb ? ` — ${l.suburb}` : ''}${region ? `, ${region.name}` : ''}.`,
      items: [{ name: l.name, slug: l.slug, vertical: l.vertical, suburb: l.suburb }],
    })
  }

  // Heritage-significant places that joined recently (boolean flag in AA).
  const heritage = listings
    .filter(l => l.heritage_significance === true && l.created_at >= since30)
    .slice(0, 4)
  for (const l of heritage) {
    const region = regionById.get(l.region_id)
    signals.push({
      kind: 'heritage',
      regionId: l.region_id,
      regionName: region?.name || null,
      headline: `A heritage story just joined the atlas: ${l.name}`,
      detail: `Recorded heritage significance${l.founded_year ? ` — founded ${l.founded_year}` : ''}${l.suburb ? `, ${l.suburb}` : ''}${region ? `, ${region.name}` : ''}.`,
      items: [{ name: l.name, slug: l.slug, vertical: l.vertical, suburb: l.suburb }],
    })
  }

  // Clusters and milestones lead; heritage and diary notes follow.
  const rank = { new_cluster: 0, milestone: 1, first_of_kind: 2, events_cluster: 3, heritage: 4, anniversary: 5 }
  signals.sort((a, b) => rank[a.kind] - rank[b.kind])
  return signals
}

// ── CSV builders (UTF-8; callers prepend BOM — council export discipline) ──

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return lines.join('\n')
}
