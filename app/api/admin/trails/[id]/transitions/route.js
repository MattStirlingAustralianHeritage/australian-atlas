import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { actionToTargetState, isValidTransition } from '@/lib/trails/transitions'
import { writeRevision } from '@/lib/trails/snapshot'

/**
 * POST /api/admin/trails/:id/transitions
 *   Body: { action: 'submit_for_review' | 'approve_publish' | 'return_to_draft' | 'unpublish' | 'resurrect',
 *           notes?: string }
 *   notes is captured on the revision row (Phase 1 substitute for the comment system).
 */
export async function POST(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const target = actionToTargetState(body.action)
  if (!target) return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: trail, error: tErr } = await sb.from('trails').select('id, status, type').eq('id', id).single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 404 })

  // Editorial workflow only.
  if (trail.type !== 'editorial') {
    return NextResponse.json({ error: `trail type=${trail.type} is not in the editorial workflow` }, { status: 400 })
  }
  if (!isValidTransition(trail.status, target)) {
    return NextResponse.json({ error: `invalid transition: ${trail.status} → ${target}` }, { status: 400 })
  }

  const patch = { status: target, last_edited_at: new Date().toISOString() }
  if (target === 'published') patch.published_at = new Date().toISOString()
  if (body.action === 'submit_for_review' && body.editor_id) patch.editor_id = body.editor_id

  const { error: uErr } = await sb.from('trails').update(patch).eq('id', id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  // Write revision capturing the notes.
  await writeRevision(sb, {
    trail_id: id, revised_by: null,
    notes: `[${body.action}] ${body.notes ?? ''}`.trim(),
  })

  return NextResponse.json({ id, status: target })
}
