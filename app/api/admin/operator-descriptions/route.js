import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { revalidatePlacePages } from '@/lib/picks/revalidate'
import { generateRewrite } from '@/lib/operator-intake/rewrite.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Admin approval gate for operator-fed descriptions.
//
// This route is the ONLY place generated text becomes live. Approving writes the
// (optionally admin-edited) text into listings.description and tags the listing
// data_source='operator_verified' — operator-sourced facts, human-approved. The
// operator route can never reach this transition. A hard editorial stop sits
// between a generated draft and the public page exactly here.
//
// 'rewrite' produces a Claude revision of a pending draft — honouring the
// operator's change request plus optional editor guidance — as a NEW pending
// version. It never publishes; the admin still reads and approves the result
// through the same gate as every other draft.
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

// ─── POST — approve (→ publish), reject, or rewrite a draft ───────────────────
// Body: { action: 'approve' | 'reject' | 'rewrite', draftId, editedText?, note?, guidance? }
export async function POST(request) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { action, draftId } = body || {}
  if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })
  if (!['approve', 'reject', 'rewrite'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action — must be approve, reject, or rewrite' }, { status: 400 })
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

    if (action === 'rewrite') {
      return await handleRewrite(sb, draft, body)
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

// ─── rewrite — Claude revision of a pending draft, as a new pending version ───
// Ground truth for the revision: the operator's facts + the live published
// description. The flagged draft's own text is revised but never grounds a
// claim. The result re-enters the queue as pending_review — nothing publishes.
async function handleRewrite(sb, draft, body) {
  const guidance = typeof body.guidance === 'string' ? body.guidance.trim() : ''

  const [{ data: facts }, { data: listing }] = await Promise.all([
    sb.from('operator_facts').select('*').eq('listing_id', draft.listing_id).maybeSingle(),
    sb.from('listings').select('id, name, slug, vertical, region, description').eq('id', draft.listing_id).maybeSingle(),
  ])

  let result
  try {
    result = await generateRewrite({
      facts: facts || draft.source_facts || {},
      listing,
      currentText: listing?.description || '',
      draftText: draft.generated_text || '',
      requestNote: draft.operator_note || '',
      adminGuidance: guidance,
    })
  } catch (err) {
    if (err?.code === 'AI_BUDGET_EXCEEDED') {
      return NextResponse.json({ error: 'Monthly AI budget exhausted — the rewrite agent is paused until next month.' }, { status: 402 })
    }
    console.error('[admin/operator-descriptions/rewrite] LLM failed:', err.message)
    return NextResponse.json({ error: 'Rewrite failed — please try again' }, { status: 502 })
  }

  // Next version, superseding every still-pending draft (including the one
  // just revised) so the queue shows only the newest.
  const { data: top } = await sb
    .from('operator_description_drafts')
    .select('version')
    .eq('listing_id', draft.listing_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (top?.version || 0) + 1

  await sb
    .from('operator_description_drafts')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('listing_id', draft.listing_id)
    .eq('status', 'pending_review')

  const rewriteNote = [
    draft.operator_note ? `Operator: ${draft.operator_note}` : null,
    guidance ? `Editor: ${guidance}` : null,
  ].filter(Boolean).join('\n') || null

  const now = new Date().toISOString()
  const { data: revised, error: insErr } = await sb
    .from('operator_description_drafts')
    .insert({
      listing_id: draft.listing_id,
      facts_id: facts?.id ?? draft.facts_id,
      version: nextVersion,
      generated_text: result.text,
      source_facts: facts || draft.source_facts || {},
      model: result.model,
      source_binding_passed: result.binding.passed,
      source_binding_report: result.binding,
      banned_phrase_passed: result.banned.passed,
      status: 'pending_review',
      origin: 'admin_rewrite',
      rewrite_note: rewriteNote,
      generated_at: now,
      submitted_at: now,
    })
    .select('*')
    .single()
  if (insErr) throw insErr

  return NextResponse.json({
    success: true,
    action: 'rewritten',
    draft: { ...revised, listing: listing || null },
    generation: { ok: result.ok, banned: result.banned, binding: result.binding },
  })
}
