import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'
import { updateListing } from '@/lib/admin/updateListing'

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, humanised, humanised_at, created_at, updated_at'

// ─── Fetch stats ────────────────────────────────────────────

async function fetchStats(sb) {
  const [humanisedRes, totalRes] = await Promise.all([
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('humanised', true),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ])
  return {
    humanised_count: humanisedRes.count || 0,
    total_active_count: totalRes.count || 0,
  }
}

// ─── Fetch one random listing (weighted, cross-vertical) ───

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

// Sanitise exclude list: remove falsy/invalid values, cap length to avoid URL limits
function sanitiseExcludeIds(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(id => id && typeof id === 'string' && id.length > 0).slice(-80)
}

async function fetchRandomListing(sb, excludeIds = [], recentVerticals = [], verticalFilter = null) {
  // Sanitise exclude list — prevents malformed PostgREST filters from null/undefined values
  const safeExclude = sanitiseExcludeIds(excludeIds)

  // Anti-clustering: if the last 5 listings were all from the same vertical,
  // exclude that vertical this round to force diversity.
  let skipVertical = null
  if (recentVerticals.length >= 5) {
    const lastFive = recentVerticals.slice(-5)
    if (new Set(lastFive).size === 1) {
      skipVertical = lastFive[0]
    }
  }

  // Fetch a small batch from EACH vertical in parallel.
  // This guarantees cross-vertical diversity instead of relying on heap order.
  // If a specific vertical is selected, only fetch from that one
  const fetchVerticals = verticalFilter
    ? [verticalFilter]
    : skipVertical
      ? ALL_VERTICALS.filter(v => v !== skipVertical)
      : ALL_VERTICALS

  const PER_VERTICAL = 6
  const promises = fetchVerticals.map(v => {
    let q = sb.from('listings').select(SELECT_COLS)
      .eq('status', 'active')
      .eq('humanised', false)
      .eq('vertical', v)
    if (safeExclude.length > 0) {
      q = q.not('id', 'in', `(${safeExclude.join(',')})`)
    }
    return q.limit(PER_VERTICAL)
  })

  const results = await Promise.allSettled(promises)
  const candidates = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value?.data || [])

  if (candidates.length > 0) {
    // Filter out any listings that made it through despite the exclude filter
    const excludeSet = new Set(safeExclude)
    const filtered = candidates.filter(l => !excludeSet.has(String(l.id)))

    const pool = filtered.length > 0 ? filtered : candidates

    // Score by missing fields — listings needing more work are prioritised
    const scored = pool.map(l => ({
      ...l,
      _missing: (
        (!l.description || l.description === '' ? 1 : 0) +
        (!l.website || l.website === '' ? 1 : 0) +
        (!l.address || l.address === '' ? 1 : 0) +
        (!l.hero_image_url || l.hero_image_url === '' ? 1 : 0)
      ),
    }))

    // Pick randomly from the top missing-fields tier
    const maxMissing = Math.max(...scored.map(s => s._missing))
    const topTier = scored.filter(s => s._missing === maxMissing)
    const pick = topTier[Math.floor(Math.random() * topTier.length)]
    const { _missing, ...listing } = pick
    return listing
  }

  // Fallback: already-humanised listings for re-review (oldest first, pick from top 5)
  let retryQuery = sb
    .from('listings')
    .select(SELECT_COLS)
    .eq('status', 'active')
    .eq('humanised', true)

  if (safeExclude.length > 0) {
    retryQuery = retryQuery.not('id', 'in', `(${safeExclude.join(',')})`)
  }

  const { data: humanised, error: retryError } = await retryQuery
    .order('humanised_at', { ascending: true, nullsFirst: true })
    .limit(20)

  if (retryError) {
    console.warn('[admin/listings-review] Fallback query error:', retryError.message)
  }

  if (humanised && humanised.length > 0) {
    const idx = Math.floor(Math.random() * Math.min(5, humanised.length))
    return humanised[idx]
  }

  return null
}

// ─── GET: Fetch a random listing + stats ────────────────────

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const excludeParam = searchParams.get('exclude') || ''
  const excludeIds = excludeParam ? excludeParam.split(',').filter(Boolean) : []
  const recentVerticalsParam = searchParams.get('recent_verticals') || ''
  const recentVerticals = recentVerticalsParam ? recentVerticalsParam.split(',').filter(Boolean) : []
  const verticalFilter = searchParams.get('vertical') || null

  try {
    const sb = getSupabaseAdmin()
    const [listing, stats] = await Promise.all([
      fetchRandomListing(sb, excludeIds, recentVerticals, verticalFilter),
      fetchStats(sb),
    ])

    return NextResponse.json({ listing, stats })
  } catch (err) {
    console.error('[admin/humanator/GET] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 })
  }
}

// ─── PATCH: Apply action to a listing ───────────────────────

export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, action, updates = {}, exclude = [], recent_verticals = [], vertical_filter = null } = body

    if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })
    if (!['humanise', 'skip', 'hide'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    let sync_status = null

    if (action === 'humanise') {
      // Use canonical update function — includes field validation + vertical sync
      const patch = { ...updates, humanised: true, humanised_at: new Date().toISOString() }
      const result = await updateListing(id, patch, { action: 'humanise' })

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      if (result.verticalSync) {
        sync_status = result.verticalSync.success
          ? { synced: true, verticalName: result.verticalSync.vertical, error: null }
          : { synced: false, verticalName: result.verticalSync.vertical, error: result.verticalSync.warning }
      }
    } else if (action === 'hide') {
      // Use canonical update function for hide
      const result = await updateListing(id, { status: 'hidden' }, { action: 'hide' })

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      if (result.verticalSync) {
        sync_status = result.verticalSync.success
          ? { synced: true, verticalName: result.verticalSync.vertical, error: null }
          : { synced: false, verticalName: result.verticalSync.vertical, error: result.verticalSync.warning }
      }
    }
    // 'skip' — no DB changes needed

    // Fetch next listing and updated stats (separate try so action success isn't masked by fetch failure)
    const excludeIds = [...(exclude || []), id].filter(Boolean)
    let next_listing = null
    let stats = null
    try {
      const [nextRes, statsRes] = await Promise.allSettled([
        fetchRandomListing(sb, excludeIds, recent_verticals, vertical_filter),
        fetchStats(sb),
      ])
      next_listing = nextRes.status === 'fulfilled' ? nextRes.value : null
      stats = statsRes.status === 'fulfilled' ? statsRes.value : null
    } catch (fetchErr) {
      console.warn('[admin/humanator/PATCH] Next-listing fetch failed:', fetchErr.message)
      // Action still succeeded — return success with null next_listing
    }

    return NextResponse.json({ success: true, next_listing, stats, sync_status })
  } catch (err) {
    console.error('[admin/humanator/PATCH] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 })
  }
}
