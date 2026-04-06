import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

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

    // If status changed to hidden or active, sync to vertical DB
    if ('status' in updates && data.source_id && data.vertical) {
      try {
        const config = VERTICAL_CONFIG[data.vertical]
        if (config?.url) {
          const verticalClient = getVerticalClient(data.vertical)
          let table = config.table
          if (data.vertical === 'fine_grounds') {
            table = 'roasters' // default; category not tracked in master
          }

          if (updates.status === 'hidden') {
            // Hide in vertical: set status/published to inactive/false
            const hideUpdate = table === 'places' || table === 'shops' || table === 'listings'
              ? { published: false }
              : { status: 'inactive' }
            await verticalClient.from(table).update(hideUpdate).eq('id', data.source_id)
          } else if (updates.status === 'active') {
            // Unhide in vertical: set status/published to active/true
            const unhideUpdate = table === 'places' || table === 'shops' || table === 'listings'
              ? { published: true }
              : { status: 'active' }
            await verticalClient.from(table).update(unhideUpdate).eq('id', data.source_id)
          }
        }
      } catch (syncErr) {
        console.warn('[admin/listings/PATCH] Vertical sync warning:', syncErr.message)
        // Non-fatal — master update already succeeded
      }
    }

    return NextResponse.json({ listing: data })
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
