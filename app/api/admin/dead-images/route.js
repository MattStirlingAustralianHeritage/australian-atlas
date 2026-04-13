import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * PATCH /api/admin/dead-images
 *
 * Process an image candidate action: approve or reject.
 *
 * Body: { id: string, action: 'approve' | 'reject' }
 *
 * approve: copies hero_image_candidate_url to hero_image_url,
 *          clears hero_image_candidate_url, updates staleness_flags
 * reject:  clears hero_image_candidate_url
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, action } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing listing id' }, { status: 400 })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject".' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()

    if (action === 'approve') {
      // Fetch the candidate URL first
      const { data: listing, error: fetchError } = await sb
        .from('listings')
        .select('hero_image_candidate_url, staleness_flags')
        .eq('id', id)
        .single()

      if (fetchError || !listing) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }

      if (!listing.hero_image_candidate_url) {
        return NextResponse.json({ error: 'No candidate image to approve' }, { status: 400 })
      }

      // Update staleness flags to clear dead status
      const flags = { ...(listing.staleness_flags || {}) }
      delete flags.hero_image_status

      const { error: updateError } = await sb
        .from('listings')
        .update({
          hero_image_url: listing.hero_image_candidate_url,
          hero_image_candidate_url: null,
          hero_image_verified_at: now,
          staleness_flags: Object.keys(flags).length > 0 ? flags : null,
          updated_at: now,
        })
        .eq('id', id)

      if (updateError) {
        console.error('[api/admin/dead-images] Approve error:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'approved', id })
    }

    if (action === 'reject') {
      const { error: updateError } = await sb
        .from('listings')
        .update({
          hero_image_candidate_url: null,
          updated_at: now,
        })
        .eq('id', id)

      if (updateError) {
        console.error('[api/admin/dead-images] Reject error:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'rejected', id })
    }
  } catch (err) {
    console.error('[api/admin/dead-images] PATCH error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
