import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { syncListingToVertical } from '@/lib/sync/pushToVertical'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/admin/listings/[id]/retry-push
 *
 * Retry pushing a master listing to its vertical DB.
 * Used when the initial push during candidate approval failed,
 * leaving source_id as 'candidate-{id}' placeholder.
 */
export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })
  }

  try {
    const sb = getSupabaseAdmin()

    // Fetch the master listing to get its vertical
    const { data: listing, error: fetchError } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Allow force re-push via ?force=true query param, even if source_id is set.
    // Useful when the vertical row exists but has the wrong published state.
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    if (!force && listing.source_id && !String(listing.source_id).startsWith('candidate-')) {
      return NextResponse.json({
        success: true,
        alreadySynced: true,
        message: `Already synced to ${listing.vertical} (source_id: ${listing.source_id}). Use ?force=true to re-push.`,
      })
    }

    // Sync to vertical DB (uses upsert — safe for both new and existing rows)
    const result = await syncListingToVertical(listing.id, listing.vertical)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        verticalName: result.verticalName,
      }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      verticalRowId: result.verticalRowId,
      verticalName: result.verticalName,
      url: result.url,
      warning: result.warning || null,
    })
  } catch (err) {
    console.error('[retry-push] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Retry failed' }, { status: 500 })
  }
}
