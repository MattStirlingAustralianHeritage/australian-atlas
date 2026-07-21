import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateDescription } from '@/lib/operator-intake/generate.mjs'
import { STORY_QUESTIONS } from '@/lib/operator-intake/voice.mjs'
import { isListingPaid } from '@/lib/listing-gallery'
import { sendAgentEmail } from '@/lib/agents/email'

// ─────────────────────────────────────────────────────────────────────────────
// Operator-fed description intake.
//
// The operator edits STRUCTURED FACTS and triggers generation; they never write
// published text. Ownership is the canonical listing_claims link (claimed_by +
// status='active'), the same authority app/api/dashboard/picks/route.js uses.
//
// Service role does the writes (after the app-level ownership check), but the
// surface is deliberately narrow: an operator can write operator_facts, trigger
// a generate, and flag/annotate a draft — and nothing else. approved_text,
// status='approved', and listings.description are reachable ONLY from the admin
// route. RLS on operator_description_drafts (read-only for owners) is the
// defence-in-depth backstop behind this app-level discipline.
// ─────────────────────────────────────────────────────────────────────────────

const FACT_KEYS = [
  'building_description',
  'what_you_book',
  'design_fitting_detail',
  'where_it_sits',
  'ownership_transition_note',
  // Free-text rewrite request — what the operator wants covered or added.
  'coverage_request',
]

async function requireUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

async function getMyListingIds(admin, userId) {
  const { data } = await admin
    .from('listing_claims')
    .select('listing_id')
    .eq('claimed_by', userId)
    .eq('status', 'active')
  return [...new Set((data || []).map(c => c.listing_id).filter(Boolean))]
}

// Managing a listing's content (structured facts → AI generation) is a
// Standard-plan feature, mirroring the listing editor's paid gate. A free-tier
// claim keeps the listing live but must complete payment to edit. Admins bypass.
async function editingLocked(admin, listingId, userId) {
  const { data: prof } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof?.role === 'admin') return false
  return !(await isListingPaid(admin, listingId))
}

// Coerce the raw form payload to the exact column shapes operator_facts expects.
function normaliseFactsInput(input) {
  const out = {}
  for (const k of FACT_KEYS) {
    const v = input?.[k]
    out[k] = typeof v === 'string' ? v.trim() : null
    if (out[k] === '') out[k] = null
  }

  // established_year — INT in [1500, 2100] or null. Never guess; blank ⇒ null.
  const yr = input?.established_year
  if (yr === null || yr === undefined || yr === '') {
    out.established_year = null
  } else {
    const n = Number.parseInt(yr, 10)
    out.established_year = Number.isInteger(n) && n >= 1500 && n <= 2100 ? n : null
  }

  // products_operators_named — TEXT[] of trimmed, non-empty entries. Accepts an
  // array or a newline-separated string (the form sends one per line).
  let products = input?.products_operators_named
  if (typeof products === 'string') products = products.split('\n')
  out.products_operators_named = Array.isArray(products)
    ? products.map(s => String(s).trim()).filter(Boolean)
    : []

  return out
}

function hasRequiredFacts(facts) {
  return Boolean(facts?.building_description?.trim()) && Boolean(facts?.what_you_book?.trim())
}

// Guided-interview answers (the retired "Your Story" page, rolled into this
// workspace). Storage stays in operator_stories.answers — jsonb keyed by the
// fixed question ids — but nothing here ever touches its status column: the
// only road to a public page is a draft through the admin review gate.
function cleanStoryAnswers(input) {
  const out = {}
  for (const { key } of STORY_QUESTIONS) {
    const v = String(input?.[key] ?? '').trim().slice(0, 800)
    if (v) out[key] = v
  }
  return out
}

async function loadStoryAnswers(admin, listingId) {
  const { data } = await admin
    .from('operator_stories')
    .select('answers')
    .eq('listing_id', listingId)
    .maybeSingle()
  return data?.answers || {}
}

async function loadListings(admin, ids) {
  if (!ids.length) return []
  const { data } = await admin
    .from('listings')
    .select('id, name, slug, vertical, description')
    .in('id', ids)
  return data || []
}

async function loadDrafts(admin, listingId) {
  const { data } = await admin
    .from('operator_description_drafts')
    .select('id, version, generated_text, approved_text, status, operator_action, operator_note, admin_note, source_binding_passed, source_binding_report, banned_phrase_passed, model, generated_at, submitted_at, approved_at')
    .eq('listing_id', listingId)
    .order('version', { ascending: false })
  return data || []
}

// ─── GET — listings I own + (for one listing) its facts and draft history ─────
export async function GET(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)
  const myListings = await loadListings(admin, myIds)

  const { searchParams } = new URL(request.url)
  let listingId = searchParams.get('listingId')
  if (!listingId && myIds.length === 1) listingId = myIds[0]

  if (!listingId) {
    return NextResponse.json({ myListings, listingId: null, facts: null, drafts: [] })
  }
  if (!myIds.includes(listingId)) {
    return NextResponse.json({ error: 'You do not own that listing' }, { status: 403 })
  }

  const [{ data: facts }, storyAnswers, drafts] = await Promise.all([
    admin.from('operator_facts').select('*').eq('listing_id', listingId).maybeSingle(),
    loadStoryAnswers(admin, listingId),
    loadDrafts(admin, listingId),
  ])

  return NextResponse.json({ myListings, listingId, facts: facts || null, storyAnswers, drafts })
}

// ─── PUT — save the operator's structured facts (owner-scoped upsert) ──────────
export async function PUT(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { listingId } = body || {}
  if (!listingId) return NextResponse.json({ error: 'Missing listingId' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)
  if (!myIds.includes(listingId)) {
    return NextResponse.json({ error: 'You can only edit facts for a listing you own' }, { status: 403 })
  }
  if (await editingLocked(admin, listingId, user.id)) {
    return NextResponse.json({ error: 'Editing your listing is a Standard-plan feature. Complete your payment to unlock editing.', code: 'payment_required' }, { status: 402 })
  }

  const facts = normaliseFactsInput(body)
  const { data, error } = await admin
    .from('operator_facts')
    .upsert(
      { listing_id: listingId, submitted_by: user.id, ...facts, updated_at: new Date().toISOString() },
      { onConflict: 'listing_id' },
    )
    .select('*')
    .single()

  if (error) {
    console.error('[dashboard/description/PUT] upsert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Interview answers ride along with the same save. Only written when the
  // form sends them, and only ever the answers column — status is untouched.
  let storyAnswers
  if (body.story_answers && typeof body.story_answers === 'object' && !Array.isArray(body.story_answers)) {
    storyAnswers = cleanStoryAnswers(body.story_answers)
    const { error: storyErr } = await admin
      .from('operator_stories')
      .upsert(
        { listing_id: listingId, answers: storyAnswers, updated_at: new Date().toISOString() },
        { onConflict: 'listing_id' },
      )
    if (storyErr) {
      console.error('[dashboard/description/PUT] story answers upsert failed:', storyErr.message)
      return NextResponse.json({ error: storyErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ facts: data, ...(storyAnswers !== undefined ? { storyAnswers } : {}) })
}

// ─── POST — generate a draft, or flag/annotate an existing one ────────────────
// Body: { listingId, action: 'generate' | 'flag_error' | 'request_changes', ... }
export async function POST(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { listingId, action } = body || {}
  if (!listingId) return NextResponse.json({ error: 'Missing listingId' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)
  if (!myIds.includes(listingId)) {
    return NextResponse.json({ error: 'You do not own that listing' }, { status: 403 })
  }

  if (action === 'generate') {
    if (await editingLocked(admin, listingId, user.id)) {
      return NextResponse.json({ error: 'Generating a description is a Standard-plan feature. Complete your payment to unlock editing.', code: 'payment_required' }, { status: 402 })
    }
    return handleGenerate(admin, listingId)
  }
  if (action === 'flag_error' || action === 'request_changes') {
    return handleOperatorFlag(admin, listingId, action, body)
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function handleGenerate(admin, listingId) {
  const { data: facts } = await admin
    .from('operator_facts')
    .select('*')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (!facts) return NextResponse.json({ error: 'Add your facts before generating' }, { status: 400 })
  if (!hasRequiredFacts(facts)) {
    return NextResponse.json({ error: 'The building and what-you-book facts are required before generating' }, { status: 400 })
  }

  const [{ data: listing }, storyAnswers] = await Promise.all([
    admin.from('listings').select('id, name, slug').eq('id', listingId).maybeSingle(),
    loadStoryAnswers(admin, listingId),
  ])

  // Interview answers ground the draft alongside the structured facts, and the
  // merged shape is snapshotted as source_facts so the admin reviews the text
  // against everything it was actually written from.
  const groundingFacts = { ...facts, story_answers: storyAnswers }

  let result
  try {
    result = await generateDescription({ facts: groundingFacts, listing })
  } catch (err) {
    console.error('[dashboard/description/generate] LLM failed:', err.message)
    return NextResponse.json({ error: 'Generation failed — please try again' }, { status: 502 })
  }

  // Next version for this listing.
  const { data: top } = await admin
    .from('operator_description_drafts')
    .select('version')
    .eq('listing_id', listingId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (top?.version || 0) + 1

  // Supersede any still-pending draft so the admin queue shows only the newest.
  await admin
    .from('operator_description_drafts')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('listing_id', listingId)
    .eq('status', 'pending_review')

  const now = new Date().toISOString()
  const { data: draft, error } = await admin
    .from('operator_description_drafts')
    .insert({
      listing_id: listingId,
      facts_id: facts.id,
      version: nextVersion,
      generated_text: result.text,
      source_facts: groundingFacts,
      model: result.model,
      source_binding_passed: result.binding.passed,
      source_binding_report: result.binding,
      banned_phrase_passed: result.banned.passed,
      status: 'pending_review',
      generated_at: now,
      submitted_at: now,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[dashboard/description/generate] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A generate IS a rewrite request — tell the admin without waiting on the queue.
  const gates = result.ok ? 'both gates passed' : 'needs a look — gate flags raised'
  await sendAgentEmail({
    subject: `Description ${nextVersion > 1 ? 'rewrite requested' : 'draft submitted'} — ${listing?.name || listingId}`,
    html: `<p><strong>${escapeHtml(listing?.name || listingId)}</strong> generated description v${nextVersion} (${gates}).</p>`
      + (facts.coverage_request ? `<p><em>What they'd like covered:</em> ${escapeHtml(facts.coverage_request)}</p>` : '')
      + `<p><a href="https://www.australianatlas.com.au/admin/operator-descriptions">Review it in the queue</a></p>`,
  })

  return NextResponse.json({ draft, generation: { ok: result.ok, banned: result.banned, binding: result.binding } })
}

// Bounded operator affordance: attach a flag/note to a draft. This is a SIGNAL
// for the admin — it never changes status to approved or touches published text.
async function handleOperatorFlag(admin, listingId, action, body) {
  const { draftId, note } = body || {}
  if (!draftId) return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })

  // The draft must belong to a listing the caller owns (already verified) AND
  // match the listingId in the body — no cross-listing writes.
  const { data: draft } = await admin
    .from('operator_description_drafts')
    .select('id, listing_id')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft || draft.listing_id !== listingId) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const operator_action = action === 'flag_error' ? 'flagged_error' : 'requested_changes'
  const cleanNote = typeof note === 'string' ? note.trim() || null : null
  const { data: updated, error } = await admin
    .from('operator_description_drafts')
    .update({
      operator_action,
      operator_note: cleanNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .select('id, version, status, operator_action, operator_note')
    .single()

  if (error) {
    console.error('[dashboard/description/flag] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The change request is the input the admin-side rewrite agent works from —
  // surface it immediately rather than waiting for a queue visit.
  const { data: listing } = await admin
    .from('listings')
    .select('name')
    .eq('id', listingId)
    .maybeSingle()
  await sendAgentEmail({
    subject: `Operator ${operator_action === 'flagged_error' ? 'flagged an error' : 'requested changes'} — ${listing?.name || listingId}`,
    html: `<p><strong>${escapeHtml(listing?.name || listingId)}</strong> on draft v${updated.version}.</p>`
      + (cleanNote ? `<p><em>Their note:</em> ${escapeHtml(cleanNote)}</p>` : '<p>No note left.</p>')
      + `<p><a href="https://www.australianatlas.com.au/admin/operator-descriptions">Open the queue to rewrite with Claude</a></p>`,
  })

  return NextResponse.json({ draft: updated })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
