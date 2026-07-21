import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { syncListingRowToVertical } from '@/lib/admin/updateListing'

/**
 * POST /api/admin/listings/[id]/sync-vertical
 *
 * Push the CURRENT master state of a listing to its vertical source DB.
 *
 * This is the second half of a deferred save: the Listing Editor PATCHes with
 * `_deferVerticalSync: true` (master write only — responds in well under a
 * second) and then calls this route in the background. Same proven sync
 * semantics as the inline path — both run syncListingRowToVertical.
 *
 * Response: { verticalSync } — the same shape PATCH returns inline, so the
 * editor's flash messaging handles both identically.
 */
export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const sb = getSupabaseAdmin()
    const { data: listing, error } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, sub_type, sub_types, status, editors_pick')
      .eq('id', id)
      .single()

    if (error || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const verticalSync = await syncListingRowToVertical(listing, { action: 'deferred-sync' })
    return NextResponse.json({ verticalSync, source_id: listing.source_id })
  } catch (err) {
    console.error('[admin/listings/sync-vertical] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 })
  }
}
