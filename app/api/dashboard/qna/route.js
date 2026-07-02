import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * /api/dashboard/qna — operator self-service "Questions & answers" for a
 * claimed listing (migration 209, table listing_qna).
 *
 * Auth: Bearer atlas shared JWT (same contract as /api/dashboard/offers).
 * Caller must be admin, or the OWNER of the listing — an active
 * listing_claims row whose claimed_by is the authenticated user.
 *
 * Q&A is a PAID perk: authoring one requires an active standard claim
 * (isListingPaid — past_due dunning grace counts; admins bypass), the same
 * gate as offers/awards and the photo gallery. Deleting is always allowed so a
 * lapsed operator can still take an entry down.
 *
 * A listing can list at most MAX_QNA rows. Unlike offers/awards, this content
 * also enriches the venue's OWN embedding + concierge grounding — so on any
 * write we flag listings.needs_embedding=true and the sync re-embeds it with
 * the Q&A text appended (see lib/embeddings/sourceText.js).
 *
 *   GET    ?listing_id=              → every Q&A for the listing (owner view)
 *   POST   { listing_id, ... }       → create (question + answer required)
 *   PATCH  { id, listing_id, ... }   → edit question/answer/position/published
 *   DELETE ?id=&listing_id=          → delete
 *
 * NOTE: pay-to-win guard — Q&A renders as an operator-attributed block on
 * /place/[slug] only, and enriches this venue's own search text. Nothing here
 * (or anywhere) may feed ranking/ordering.
 */

const MAX_QNA = 8
const MAX_QUESTION = 120
const MAX_ANSWER = 600

const SELECT_COLS = 'id, listing_id, question, answer, position, published, created_at, updated_at'

// Verify the token + ownership of the listing (mirrors /api/dashboard/offers).
// Returns { fail } (a response) on any failure, or { sb, user, listing }.
async function authorize(request, listingId) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) return { fail: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) return { fail: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return { fail: NextResponse.json({ error: 'Vendor role required' }, { status: 403 }) }
  }
  if (!listingId) return { fail: NextResponse.json({ error: 'Missing listing_id' }, { status: 400 }) }

  const sb = getSupabaseAdmin()
  const { data: listing, error } = await sb
    .from('listings')
    .select('id, slug, is_claimed')
    .eq('id', listingId)
    .single()
  if (error || !listing) return { fail: NextResponse.json({ error: 'Listing not found' }, { status: 404 }) }
  if (!listing.is_claimed) return { fail: NextResponse.json({ error: 'Listing is not claimed' }, { status: 403 }) }
  if (user.role !== 'admin') {
    const { data: ownClaim } = await sb
      .from('listing_claims')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimed_by', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!ownClaim) {
      return { fail: NextResponse.json({ error: 'You do not own this listing' }, { status: 403 }) }
    }
  }
  return { sb, user, listing }
}

async function isPaid(sb, user, listingId) {
  if (user.role === 'admin') return true
  return isListingPaid(sb, listingId)
}

// Bust the ISR cache for the public place page a Q&A change affects.
function revalidateQna(listingSlug) {
  try {
    if (listingSlug) revalidatePath(`/place/${listingSlug}`)
  } catch { /* best-effort cache busting */ }
}

// Any Q&A write changes the venue's own search text — flag it for a re-embed.
// Best-effort: a failure here never fails the write (the row is still saved).
async function flagNeedsEmbedding(sb, listingId) {
  try {
    await sb.from('listings').update({ needs_embedding: true }).eq('id', listingId)
  } catch { /* best-effort — the drift trigger also covers many edits */ }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  const auth = await authorize(request, listingId)
  if (auth.fail) return auth.fail

  try {
    const [{ data: qna, error }, paid] = await Promise.all([
      auth.sb
        .from('listing_qna')
        .select(SELECT_COLS)
        .eq('listing_id', listingId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      isPaid(auth.sb, auth.user, listingId),
    ])
    if (error) throw error
    return NextResponse.json({ qna: qna || [], paid, maxQna: MAX_QNA })
  } catch (err) {
    console.error('[dashboard/qna] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to load questions' }, { status: 500 })
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Questions & answers are a paid feature — upgrade this listing to add them.' }, { status: 403 })
  }

  // ── Server-side validation (lengths mirror the CHECK constraints) ──
  const question = String(body.question || '').trim()
  if (!question) return NextResponse.json({ error: 'Add a question' }, { status: 400 })
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: `Questions can be up to ${MAX_QUESTION} characters` }, { status: 400 })
  }
  const answer = String(body.answer || '').trim()
  if (!answer) return NextResponse.json({ error: 'Add an answer' }, { status: 400 })
  if (answer.length > MAX_ANSWER) {
    return NextResponse.json({ error: `Answers can be up to ${MAX_ANSWER} characters` }, { status: 400 })
  }

  try {
    // Per-listing cap. A count-then-insert race could briefly exceed it; the
    // cap is a product guardrail, not an invariant (same stance as offers).
    const { count } = await auth.sb
      .from('listing_qna')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', auth.listing.id)
    if ((count || 0) >= MAX_QNA) {
      return NextResponse.json({
        error: `Each listing can show up to ${MAX_QNA} questions — remove one to add another.`,
      }, { status: 400 })
    }

    // New rows go to the end of the current list.
    const position = Number.isInteger(count) ? count : 0

    const { data: entry, error } = await auth.sb
      .from('listing_qna')
      .insert({
        listing_id: auth.listing.id,
        question,
        answer,
        position,
        published: body.published === false ? false : true,
      })
      .select(SELECT_COLS)
      .single()
    if (error) throw error

    await flagNeedsEmbedding(auth.sb, auth.listing.id)
    revalidateQna(auth.listing.slug)
    return NextResponse.json({ qna: entry })
  } catch (err) {
    console.error('[dashboard/qna] POST error:', err.message)
    return NextResponse.json({ error: 'Failed to save question' }, { status: 500 })
  }
}

export async function PATCH(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Questions & answers are a paid feature — upgrade this listing to edit them.' }, { status: 403 })
  }
  if (!body.id) return NextResponse.json({ error: 'Missing question id' }, { status: 400 })

  // Only the fields present in the body are touched — a partial edit.
  const patch = { updated_at: new Date().toISOString() }
  if (body.question !== undefined) {
    const question = String(body.question || '').trim()
    if (!question) return NextResponse.json({ error: 'Add a question' }, { status: 400 })
    if (question.length > MAX_QUESTION) {
      return NextResponse.json({ error: `Questions can be up to ${MAX_QUESTION} characters` }, { status: 400 })
    }
    patch.question = question
  }
  if (body.answer !== undefined) {
    const answer = String(body.answer || '').trim()
    if (!answer) return NextResponse.json({ error: 'Add an answer' }, { status: 400 })
    if (answer.length > MAX_ANSWER) {
      return NextResponse.json({ error: `Answers can be up to ${MAX_ANSWER} characters` }, { status: 400 })
    }
    patch.answer = answer
  }
  if (body.position !== undefined) {
    const position = Number.parseInt(body.position, 10)
    if (!Number.isInteger(position) || position < 0 || position > 999) {
      return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
    }
    patch.position = position
  }
  if (body.published !== undefined) {
    patch.published = body.published === true
  }

  try {
    const { data, error } = await auth.sb
      .from('listing_qna')
      .update(patch)
      .eq('id', body.id)
      .eq('listing_id', auth.listing.id)
      .select(SELECT_COLS)
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    await flagNeedsEmbedding(auth.sb, auth.listing.id)
    revalidateQna(auth.listing.slug)
    return NextResponse.json({ qna: data[0] })
  } catch (err) {
    console.error('[dashboard/qna] PATCH error:', err.message)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  let id = searchParams.get('id')
  let listingId = searchParams.get('listing_id')
  if (!id || !listingId) {
    try { const b = await request.json(); id = id || b?.id; listingId = listingId || b?.listing_id } catch { /* no body */ }
  }

  const auth = await authorize(request, listingId)
  if (auth.fail) return auth.fail
  if (!id) return NextResponse.json({ error: 'Missing question id' }, { status: 400 })

  try {
    const { data, error } = await auth.sb
      .from('listing_qna')
      .delete()
      .eq('id', id)
      .eq('listing_id', auth.listing.id)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    await flagNeedsEmbedding(auth.sb, auth.listing.id)
    revalidateQna(auth.listing.slug)
    return NextResponse.json({ success: true, deletedId: id })
  } catch (err) {
    console.error('[dashboard/qna] DELETE error:', err.message)
    return NextResponse.json({ error: 'Failed to remove question' }, { status: 500 })
  }
}
