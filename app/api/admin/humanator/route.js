import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { mapToVerticalSchema, updateInVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, humanised, humanised_at, created_at, updated_at'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'hero_image_url',
]

// ─── Sync listing to vertical DB ────────────────────────────

async function syncToVertical(sb, listingId, vertical) {
  const verticalName = VERTICAL_DISPLAY_NAMES[vertical] || vertical

  try {
    const config = VERTICAL_CONFIG[vertical]
    if (!config || !config.url) {
      return { synced: false, verticalName, error: `No config for vertical: ${vertical}` }
    }

    // Re-fetch the full listing from master (need all fields for the schema mapper)
    const { data: listing, error: readError } = await sb
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single()

    if (readError || !listing) {
      return { synced: false, verticalName, error: `Master listing not found: ${readError?.message || 'no data'}` }
    }

    const client = getVerticalClient(vertical)
    const verticalRow = mapToVerticalSchema(vertical, listing)

    // Determine target table
    let table = config.table
    if (vertical === 'fine_grounds') {
      table = listing.category === 'cafe' ? 'cafes' : 'roasters'
    }

    // If listing already has a source_id, update the existing vertical row
    if (listing.source_id) {
      const { error: updateError } = await client
        .from(table)
        .update(verticalRow)
        .eq('id', listing.source_id)

      if (updateError) {
        return { synced: false, verticalName, error: updateError.message }
      }
      return { synced: true, verticalName, error: null }
    }

    // No source_id — insert a new row and link it back to master
    const { data: inserted, error: insertError } = await client
      .from(table)
      .insert(verticalRow)
      .select('id')
      .single()

    if (insertError) {
      return { synced: false, verticalName, error: insertError.message }
    }

    // Update master source_id so future syncs won't duplicate
    if (inserted?.id) {
      await sb
        .from('listings')
        .update({ source_id: String(inserted.id) })
        .eq('id', listingId)
    }

    return { synced: true, verticalName, error: null }
  } catch (err) {
    return { synced: false, verticalName, error: err.message }
  }
}

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

async function fetchRandomListing(sb, excludeIds = [], recentVerticals = []) {
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
  const fetchVerticals = skipVertical
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
    console.warn('[admin/humanator] Fallback query error:', retryError.message)
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

  try {
    const sb = getSupabaseAdmin()
    const [listing, stats] = await Promise.all([
      fetchRandomListing(sb, excludeIds, recentVerticals),
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
    const { id, action, updates = {}, exclude = [], recent_verticals = [] } = body

    if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })
    if (!['humanise', 'skip', 'hide'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    let sync_status = null

    if (action === 'humanise') {
      // Build update payload from allowed fields
      const patch = {}
      for (const key of ALLOWED_FIELDS) {
        if (key in updates) patch[key] = updates[key]
      }

      // Validate lat/lng if provided
      if ('lat' in patch && patch.lat !== null) {
        patch.lat = parseFloat(patch.lat)
        if (isNaN(patch.lat)) return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
      }
      if ('lng' in patch && patch.lng !== null) {
        patch.lng = parseFloat(patch.lng)
        if (isNaN(patch.lng)) return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 })
      }

      patch.humanised = true
      patch.humanised_at = new Date().toISOString()
      patch.updated_at = new Date().toISOString()

      const { error } = await sb
        .from('listings')
        .update(patch)
        .eq('id', id)

      if (error) throw error

      // Fetch the listing's vertical so we know where to sync
      const { data: saved } = await sb
        .from('listings')
        .select('vertical')
        .eq('id', id)
        .single()

      if (saved?.vertical) {
        sync_status = await syncToVertical(sb, id, saved.vertical)
        if (!sync_status.synced) {
          console.warn(`[admin/humanator] Vertical sync failed for ${id}:`, sync_status.error)
        }
      }
    } else if (action === 'hide') {
      // Fetch listing first to get vertical + source_id for sync
      const { data: hideListing } = await sb
        .from('listings')
        .select('vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address')
        .eq('id', id)
        .single()

      const { error } = await sb
        .from('listings')
        .update({
          status: 'hidden',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      // Sync the hide to the vertical DB so it's removed from the live site
      if (hideListing?.vertical && hideListing?.source_id) {
        const hideResult = await updateInVertical(hideListing.vertical, hideListing.source_id, {
          ...hideListing,
          _hidden: true,
        })
        const vName = VERTICAL_DISPLAY_NAMES[hideListing.vertical] || hideListing.vertical
        sync_status = hideResult.success
          ? { synced: true, verticalName: vName, error: null }
          : { synced: false, verticalName: vName, error: hideResult.error }
        if (!hideResult.success) {
          console.warn(`[admin/humanator] Hide sync to ${vName} failed:`, hideResult.error)
        }
      }
    }
    // 'skip' — no DB changes needed

    // Fetch next listing and updated stats (separate try so action success isn't masked by fetch failure)
    const excludeIds = [...(exclude || []), id].filter(Boolean)
    let next_listing = null
    let stats = null
    try {
      const [nextRes, statsRes] = await Promise.allSettled([
        fetchRandomListing(sb, excludeIds, recent_verticals),
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
