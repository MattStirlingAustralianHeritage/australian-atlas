import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { revalidatePlacePages } from '@/lib/picks/revalidate'

// ─────────────────────────────────────────────────────────────────────────────
// Admin approval gate for operator-fed descriptions.
//
// This route is the ONLY place generated text becomes live. Approving writes the
// (optionally admin-edited) text into listings.description and tags the listing
// data_source='operator_verified' — operator-sourced facts, human-approved. The
// operator route can never reach this transition. A hard editorial stop sits
// between a generated draft and the public page exactly here.
// ─────────────────────────────────────────────────────────────────────────────

async function ensureAdmin() {
  const cookieStore = await cookies()
  return checkAdmin(cookieStore)
}

// ─── GET — drafts awaiting review, newest first, with the source facts ────────
export async function GET() {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data: drafts, error } = await sb
    .from('operator_description_drafts')
    .select('*')
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[admin/operator-descriptions/GET] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Batch-hydrate listing name/slug/current description for each draft.
  const listingIds = [...new Set((drafts || []).map(d => d.listing_id).filter(Boolean))]
  let listingsById = {}
  if (listingIds.length) {
    const { data: listings } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, description')
      .in('id', listingIds)
    listingsById = Object.fromEntries((listings || []).map(l => [l.id, l]))
  }

  const hydrated = (drafts || []).map(d => ({ ...d, listing: listingsById[d.listing_id] || null }))
  return NextResponse.json({ drafts: hydrated })
}

// ─── POST — approve (→ publish) or reject a draft ─────────────────────────────
// Body: { action: 'approve' | 'reject', draftId, editedText?, note? }
export async function POST(request) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { action, draftId } = body || {}
  if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action — must be approve or reject' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data: draft, error: fetchErr } = await sb
      .from('operator_description_drafts')
      .select('*')
      .eq('id', draftId)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (draft.status !== 'pending_review') {
      return NextResponse.json({ error: `Draft already ${draft.status}` }, { status: 409 })
    }

    if (action === 'reject') {
      const { error: updErr } = await sb
        .from('operator_description_drafts')
        .update({
          status: 'rejected',
          admin_note: (body.note || '').trim() || null,
          reviewed_by: 'admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftId)
      if (updErr) throw updErr
      return NextResponse.json({ success: true, action: 'rejected' })
    }

    // approve → publish. The admin may edit before approving; their text wins.
    const edited = typeof body.editedText === 'string' ? body.editedText.trim() : ''
    const approvedText = edited || draft.generated_text
    const now = new Date().toISOString()

    const { error: updErr } = await sb
      .from('operator_description_drafts')
      .update({
        approved_text: approvedText,
        status: 'approved',
        admin_note: (body.note || '').trim() || null,
        reviewed_by: 'admin',
        approved_at: now,
        updated_at: now,
      })
      .eq('id', draftId)
    if (updErr) throw updErr

    // The publish: the live field the place page already renders. Tagging
    // data_source records the real provenance (operator-sourced, admin-approved).
    const { error: pubErr } = await sb
      .from('listings')
      .update({ description: approvedText, data_source: 'operator_verified' })
      .eq('id', draft.listing_id)
    if (pubErr) throw pubErr

    await revalidatePlacePages(sb, [draft.listing_id])

    return NextResponse.json({ success: true, action: 'approved', published: approvedText })
  } catch (err) {
    console.error('[admin/operator-descriptions/POST] error:', err.message)
    return NextResponse.json({ error: `Action failed: ${err.message || 'Unknown error'}` }, { status: 500 })
  }
}
