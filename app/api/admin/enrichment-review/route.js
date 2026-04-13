import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * PATCH /api/admin/enrichment-review
 *
 * Process an enrichment review action: approve or reject an AI-generated description.
 *
 * Body: { id: string, action: 'approve' | 'reject', description?: string }
 *
 * approve: copies ai_description (or provided description) to the description column,
 *          sets enrichment_status = 'approved'
 * reject:  sets enrichment_status = 'rejected', leaves description unchanged
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, action, description } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing listing id' }, { status: 400 })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject".' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()

    if (action === 'approve') {
      // If a custom description was provided (edit & approve), use that.
      // Otherwise, fetch the ai_description from the listing.
      let finalDescription = description

      if (!finalDescription) {
        const { data: listing, error: fetchError } = await sb
          .from('listings')
          .select('ai_description')
          .eq('id', id)
          .single()

        if (fetchError || !listing) {
          return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
        }

        finalDescription = listing.ai_description
      }

      if (!finalDescription) {
        return NextResponse.json({ error: 'No description to approve' }, { status: 400 })
      }

      const { error: updateError } = await sb
        .from('listings')
        .update({
          description: finalDescription,
          enrichment_status: 'approved',
          updated_at: now,
        })
        .eq('id', id)

      if (updateError) {
        console.error('[api/admin/enrichment-review] Approve error:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'approved', id })
    }

    if (action === 'reject') {
      const { error: updateError } = await sb
        .from('listings')
        .update({
          enrichment_status: 'rejected',
          updated_at: now,
        })
        .eq('id', id)

      if (updateError) {
        console.error('[api/admin/enrichment-review] Reject error:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'rejected', id })
    }
  } catch (err) {
    console.error('[api/admin/enrichment-review] PATCH error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
