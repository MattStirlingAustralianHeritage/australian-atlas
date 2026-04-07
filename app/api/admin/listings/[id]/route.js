import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateListing } from '@/lib/admin/updateListing'

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const body = await request.json()
    const result = await updateListing(id, body, { action: 'listing-editor' })

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ listing: result.listing, verticalSync: result.verticalSync })
  } catch (err) {
    console.error('[admin/listings/PATCH] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 })
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
