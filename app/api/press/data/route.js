import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { signPressIcsToken } from '@/lib/press/tokens'
import {
  getFollowedRegions,
  regionFactSheet,
  networkOverview,
  listRecentAdditions,
  listEventsForRegions,
  computeStorySignals,
  applyPublicListings,
  fetchAllRows,
} from '@/lib/press/insights'

// The Newsroom data hub — one session-gated GET, dispatched on ?view=
// (the council data-route pattern):
//   overview — newsdesk: follows, signals, fresh events, recent additions, leads
//   regions  — all live regions + followed flags; ?region=slug adds a fact sheet
//   events   — upcoming events across followed regions (?scope=all for network)
//   leads    — published story leads visible to this member
//   data     — data room: network overview + per-region citable table
//   requests — this member's requests
//   settings — profile + notification prefs + personal ICS feed URL

export const maxDuration = 60

export async function GET(req) {
  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  const session = validatePressSession(cookie?.value)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'overview'

  try {
    const { data: account } = await sb
      .from('press_accounts')
      .select('id, name, outlet, slug, outlet_type, contact_email, role_title, website, status, cadence, notify_events, notify_listings, notify_leads, beat_verticals, created_at, last_login_at')
      .eq('id', session.pressId)
      .single()

    if (!account || account.status !== 'active') {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const followedRegions = await getFollowedRegions(sb, account.id)
    const followedIds = followedRegions.map(r => r.id)
    const press = publicAccount(account)

    if (view === 'overview') {
      const [network, signals, additions, events, leads, newCountRes] = await Promise.all([
        networkOverview(sb),
        computeStorySignals(sb, followedRegions),
        listRecentAdditions(sb, { regionIds: followedIds, sinceDays: 30, limit: 12 }),
        listEventsForRegions(sb, { regionIds: followedIds, beats: account.beat_verticals || [], limit: 8 }),
        visibleLeads(sb, followedIds, { limit: 3 }),
        followedIds.length
          ? applyPublicListings(
              sb.from('listings_with_region')
                .select('id', { count: 'exact', head: true })
                .in('region_id', followedIds)
            ).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
          : Promise.resolve({ count: 0 }),
      ])
      return NextResponse.json({
        press, regions: followedRegions, network, signals,
        recentAdditions: additions, recentAdditionsCount: newCountRes.count || 0,
        upcomingEvents: events, leads,
      })
    }

    if (view === 'regions') {
      const { data: allRegions } = await sb
        .from('regions')
        .select('id, slug, name, state, listing_count, center_lat, center_lng, map_zoom, hero_image_url')
        .eq('status', 'live')
        .order('name')
      let factSheet = null
      const regionSlug = searchParams.get('region')
      if (regionSlug) {
        const region = (allRegions || []).find(r => r.slug === regionSlug)
        if (region) factSheet = await regionFactSheet(sb, region)
      }
      return NextResponse.json({
        press,
        regions: followedRegions,
        allRegions: allRegions || [],
        followedIds,
        factSheet,
      })
    }

    if (view === 'events') {
      const scope = searchParams.get('scope') || 'followed'
      let regionIds = followedIds
      if (scope === 'all') {
        const { data: allRegions } = await sb
          .from('regions').select('id').eq('status', 'live')
        regionIds = (allRegions || []).map(r => r.id)
      }
      const events = await listEventsForRegions(sb, {
        regionIds,
        beats: searchParams.get('beats') === '1' ? (account.beat_verticals || []) : [],
        limit: 100,
      })
      // Name the region on each card without another join client-side.
      const { data: regionRows } = regionIds.length
        ? await sb.from('regions').select('id, name, slug').in('id', regionIds)
        : { data: [] }
      const regionNames = Object.fromEntries((regionRows || []).map(r => [r.id, { name: r.name, slug: r.slug }]))
      return NextResponse.json({ press, regions: followedRegions, events, regionNames, scope })
    }

    if (view === 'leads') {
      const leads = await visibleLeads(sb, followedIds, { limit: 50, includeEmbargoed: true })
      return NextResponse.json({ press, regions: followedRegions, leads })
    }

    if (view === 'data') {
      const [network, factSheets] = await Promise.all([
        networkOverview(sb),
        allRegionCounts(sb),
      ])
      return NextResponse.json({ press, regions: followedRegions, network, regionTable: factSheets })
    }

    if (view === 'requests') {
      const { data: requests } = await sb
        .from('press_requests')
        .select('id, request_type, subject, message, deadline, status, created_at, listing_id, region_id')
        .eq('press_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50)
      return NextResponse.json({ press, regions: followedRegions, requests: requests || [] })
    }

    if (view === 'settings') {
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
      const icsUrl = `${site}/api/press/ics?feed=${encodeURIComponent(signPressIcsToken(account.id))}`
      return NextResponse.json({ press, regions: followedRegions, icsUrl })
    }

    return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
  } catch (err) {
    console.error('Press data error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function publicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    outlet: account.outlet,
    slug: account.slug,
    outlet_type: account.outlet_type,
    contact_email: account.contact_email,
    role_title: account.role_title,
    website: account.website,
    cadence: account.cadence,
    notify_events: account.notify_events,
    notify_listings: account.notify_listings,
    notify_leads: account.notify_leads,
    beat_verticals: account.beat_verticals || [],
    created_at: account.created_at,
  }
}

// Published leads this member can see: network-wide or in a followed region.
// Embargoed leads are included only when asked for (the leads page shows them
// with a badge; the overview never does).
async function visibleLeads(sb, followedIds, { limit = 20, includeEmbargoed = false } = {}) {
  const { data } = await sb
    .from('press_leads')
    .select('id, title, summary, body, lead_type, region_id, vertical, embargo_until, published_at, region:regions ( name, slug )')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit * 3)
  const nowIso = new Date().toISOString()
  return (data || [])
    .filter(l => !l.region_id || followedIds.includes(l.region_id))
    .filter(l => includeEmbargoed || !l.embargo_until || l.embargo_until <= nowIso)
    .slice(0, limit)
}

// The data room's per-region table: live regions with public listing counts.
async function allRegionCounts(sb) {
  const { data: regions } = await sb
    .from('regions')
    .select('id, slug, name, state')
    .eq('status', 'live')
    .order('name')
  if (!regions?.length) return []

  const rows = await fetchAllRows(() => applyPublicListings(
    sb.from('listings_with_region')
      .select('id, region_id, vertical, created_at')
      .in('region_id', regions.map(r => r.id))
  ).order('id'), { cap: 20000 })

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const tally = new Map()
  for (const row of rows || []) {
    if (!tally.has(row.region_id)) tally.set(row.region_id, { total: 0, new30: 0 })
    const t = tally.get(row.region_id)
    t.total += 1
    if (row.created_at >= since30) t.new30 += 1
  }
  return regions.map(r => ({
    ...r,
    total: tally.get(r.id)?.total || 0,
    new30: tally.get(r.id)?.new30 || 0,
  }))
}
