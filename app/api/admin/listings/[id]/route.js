import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateInVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'status', 'hero_image_url', 'vertical',
]

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at'

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const body = await request.json()
    const updates = {}

    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate lat/lng if provided
    if ('lat' in updates && updates.lat !== null) {
      updates.lat = parseFloat(updates.lat)
      if (isNaN(updates.lat)) return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
    }
    if ('lng' in updates && updates.lng !== null) {
      updates.lng = parseFloat(updates.lng)
      if (isNaN(updates.lng)) return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (error) throw error

    // Sync ALL field changes to the vertical DB (not just status changes).
    // Uses shared updateInVertical which maps fields to the vertical's schema.
    let verticalSync = null
    if (data.vertical && data.source_id) {
      const syncData = {
        name: data.name,
        slug: data.slug,
        description: data.description,
        region: data.region,
        state: data.state,
        lat: data.lat,
        lng: data.lng,
        website: data.website,
        phone: data.phone,
        address: data.address,
        suburb: data.region,
        category: null, // not tracked in master
        _hidden: data.status === 'hidden',
      }

      const result = await updateInVertical(data.vertical, data.source_id, syncData)
      const verticalName = VERTICAL_DISPLAY_NAMES[data.vertical] || data.vertical

      if (result.success) {
        console.log(`[admin/listings/PATCH] Synced to ${verticalName} (table: ${result.table})`)
        verticalSync = { success: true, vertical: verticalName }
      } else {
        console.warn(`[admin/listings/PATCH] Vertical sync failed: ${result.error}`)
        verticalSync = { success: false, vertical: verticalName, warning: result.error }
      }
    }

    return NextResponse.json({ listing: data, verticalSync })
  } catch (err) {
    console.error('[admin/listings/PATCH] Error:', err.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// ─── DELETE handler ──────────────────────────────────────────

export async function DELETE(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const sb = getSupabaseAdmin()

    // Fetch the listing first to get vertical + source_id
    const { data: listing, error: fetchError } = await sb
      .from('listings')
      .select('id, vertical, source_id, name')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Delete from the vertical DB if source_id exists
    if (listing.source_id && listing.vertical) {
      try {
        const config = VERTICAL_CONFIG[listing.vertical]
        if (config?.url) {
          const verticalClient = getVerticalClient(listing.vertical)
          let table = config.table
          if (listing.vertical === 'fine_grounds') {
            table = 'roasters' // default
          }
          await verticalClient.from(table).delete().eq('id', listing.source_id)
        }
      } catch (syncErr) {
        console.warn('[admin/listings/DELETE] Vertical delete warning:', syncErr.message)
        // Continue — still delete from master
      }
    }

    // Delete from master DB
    const { error: deleteError } = await sb
      .from('listings')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true, deleted_id: id })
  } catch (err) {
    console.error('[admin/listings/DELETE] Error:', err.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
