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

// ─── Fetch one random listing (weighted) ────────────────────

async function fetchRandomListing(sb, excludeIds = []) {
  // Build the weighted random query via RPC or fallback
  // Priority: un-humanised first, then by missing fields count, then random
  let query = sb
    .from('listings')
    .select(SELECT_COLS)
    .eq('status', 'active')

  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  // First try: un-humanised listings with most missing fields
  const { data: unhumanised, error: err1 } = await query
    .eq('humanised', false)
    .limit(50)

  if (!err1 && unhumanised && unhumanised.length > 0) {
    // Score by missing fields and pick weighted random
    const scored = unhumanised.map(l => ({
      ...l,
      missing: (
        (!l.description || l.description === '' ? 1 : 0) +
        (!l.website || l.website === '' ? 1 : 0) +
        (!l.address || l.address === '' ? 1 : 0) +
        (!l.hero_image_url || l.hero_image_url === '' ? 1 : 0)
      ),
    }))
    // Sort by most missing fields first, then randomise within same tier
    scored.sort((a, b) => b.missing - a.missing || Math.random() - 0.5)
    const { missing, ...listing } = scored[0]
    return listing
  }

  // Second try: already humanised listings (re-review)
  let retryQuery = sb
    .from('listings')
    .select(SELECT_COLS)
    .eq('status', 'active')
    .eq('humanised', true)

  if (excludeIds.length > 0) {
    retryQuery = retryQuery.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data: humanised, error: err2 } = await retryQuery
    .order('humanised_at', { ascending: true, nullsFirst: true })
    .limit(20)

  if (!err2 && humanised && humanised.length > 0) {
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

  try {
    const sb = getSupabaseAdmin()
    const [listing, stats] = await Promise.all([
      fetchRandomListing(sb, excludeIds),
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
    const { id, action, updates = {}, exclude = [] } = body

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

    // Fetch next listing and updated stats
    const excludeIds = [...(exclude || []), id]
    const [next_listing, stats] = await Promise.all([
      fetchRandomListing(sb, excludeIds),
      fetchStats(sb),
    ])

    return NextResponse.json({ success: true, next_listing, stats, sync_status })
  } catch (err) {
    console.error('[admin/humanator/PATCH] Error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
