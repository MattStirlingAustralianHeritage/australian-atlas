import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * PATCH /api/admin/voice-review
 *
 * Process a voice review action: accept a rewrite or dismiss the evaluation.
 *
 * Body: { evaluationId: string, action: 'accept' | 'dismiss', description?: string }
 *
 * accept:  copies suggested_rewrite (or provided description) to the listing description,
 *          sets evaluation actioned = true
 * dismiss: sets evaluation actioned = true without changing description
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { evaluationId, action, description } = body

    if (!evaluationId) {
      return NextResponse.json({ error: 'Missing evaluationId' }, { status: 400 })
    }

    if (!['accept', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "accept" or "dismiss".' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()

    // Fetch the evaluation
    const { data: evaluation, error: fetchError } = await sb
      .from('description_evaluations')
      .select('id, listing_id, suggested_rewrite')
      .eq('id', evaluationId)
      .single()

    if (fetchError || !evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    if (action === 'accept') {
      // Use custom description if provided, otherwise use suggested_rewrite
      const finalDescription = description || evaluation.suggested_rewrite

      if (!finalDescription) {
        return NextResponse.json({ error: 'No description to accept' }, { status: 400 })
      }

      // Update listing description
      const { error: updateError } = await sb
        .from('listings')
        .update({
          description: finalDescription,
          updated_at: now,
        })
        .eq('id', evaluation.listing_id)

      if (updateError) {
        console.error('[api/admin/voice-review] Accept error:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Mark evaluation as actioned
      const { error: actionError } = await sb
        .from('description_evaluations')
        .update({ actioned: true })
        .eq('id', evaluationId)

      if (actionError) {
        console.error('[api/admin/voice-review] Action flag error:', actionError.message)
        return NextResponse.json({ error: actionError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'accepted', evaluationId })
    }

    if (action === 'dismiss') {
      // Mark evaluation as actioned without changing description
      const { error: actionError } = await sb
        .from('description_evaluations')
        .update({ actioned: true })
        .eq('id', evaluationId)

      if (actionError) {
        console.error('[api/admin/voice-review] Dismiss error:', actionError.message)
        return NextResponse.json({ error: actionError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'dismissed', evaluationId })
    }
  } catch (err) {
    console.error('[api/admin/voice-review] PATCH error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
