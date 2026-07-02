import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import {
  MAX_PICKS,
  listOutgoing,
  listIncoming,
  createPick,
  deletePick,
  hydrateListings,
} from '@/lib/picks/producerPicks'
import { revalidatePlacePages } from '@/lib/picks/revalidate'
import { isListingPaid } from '@/lib/listing-gallery'
import { pickRecommendationEmail, sendPicksEmail } from '@/lib/email/picksEmails'

// Resolve the listings owned by the signed-in user via the canonical
// ownership table (listing_claims: claimed_by + status='active'). This is the
// authoritative owner link — listings.is_claimed alone has no owner attribution.
async function getMyListingIds(admin, userId) {
  const { data } = await admin
    .from('listing_claims')
    .select('listing_id')
    .eq('claimed_by', userId)
    .eq('status', 'active')
  return [...new Set((data || []).map(c => c.listing_id).filter(Boolean))]
}

async function requireUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// GET — the signed-in operator's outgoing picks, incoming picks, and the set
// of listings they own (so the UI can pick which one is doing the vouching).
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)

  if (!myIds.length) {
    return NextResponse.json({ outgoing: [], incoming: [], myListings: [], maxPicks: MAX_PICKS })
  }

  const [outgoing, incoming, listingMap] = await Promise.all([
    listOutgoing(admin, myIds),
    listIncoming(admin, myIds),
    hydrateListings(admin, myIds),
  ])

  const myListings = myIds
    .map(id => listingMap[id])
    .filter(Boolean)
    .map(l => ({
      id: l.id,
      name: l.name,
      vertical: l.vertical,
      slug: l.slug,
      pickCount: outgoing.filter(p => p.curatorId === l.id).length,
    }))

  return NextResponse.json({ outgoing, incoming, myListings, maxPicks: MAX_PICKS })
}

// ─── Picks reciprocity loop ──────────────────────────────────────────────────
// When a PAID operator saves a pick, close the loop with the PICKED venue:
//   - claimed picked venue (listing_claims status active/past_due) → branded
//     "a fellow operator recommends you" email to its claimant
//     (lib/email/picksEmails.js). Nothing about the picker is revealed beyond
//     their public venue name.
//   - unclaimed picked venue → a social-proof note in the admin outreach queue
//     (operator_outreach, migration 061) so outreach can cite the
//     recommendation ("a fellow maker recommends you").
//
// Dedupe ledger: a 'picked_by:<curatorId>' marker written into the picked
// listing's operator_outreach.notes. One durable mechanism covers both paths —
// if the marker is already present for this curator the loop is a no-op, so
// the same picked venue is never emailed (or re-queued) about the same picker
// twice, even across pick delete/re-create. The admin outreach queue assumes
// one row per listing (see app/api/admin/outreach/route.js POST), so when a
// row already exists the marker line is APPENDED to its notes rather than
// inserting a second row.
//
// Every failure mode here is swallowed and logged — the pick save must never
// block on, or fail because of, email/outreach errors.

async function runPickReciprocity(admin, pick) {
  const { curatorId, pickedId, curatorName, pickedName, pickedSlug } = pick || {}
  if (!curatorId || !pickedId) return
  // Grounding guard: only real hydrated listing names go into operator-facing
  // copy ('Unknown venue' is shapePick's hydration-failure fallback).
  if (!curatorName || curatorName === 'Unknown venue') return
  if (!pickedName || pickedName === 'Unknown venue') return

  // Reciprocity is a PAID-picker loop: only fire when the vouching listing
  // holds a live standard claim (active, or past_due dunning grace —
  // lib/listing-gallery.js isListingPaid).
  if (!(await isListingPaid(admin, curatorId))) return

  const marker = `picked_by:${curatorId}`

  // Dedupe check against the outreach ledger for the picked listing.
  const { data: outreachRows, error: outreachErr } = await admin
    .from('operator_outreach')
    .select('id, notes, status')
    .eq('listing_id', pickedId)
    .order('created_at', { ascending: true })
  if (outreachErr) {
    // Can't verify the ledger — do nothing rather than risk a repeat email.
    console.error('[picks] reciprocity dedupe check failed:', outreachErr.message)
    return
  }
  const rows = outreachRows || []
  if (rows.some(r => (r.notes || '').includes(marker))) return
  const existing = rows[0] || null

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // Append the marker line to the existing row, or create the row. `patch`
  // applies only on update, `insert` only on create (status transitions differ:
  // an existing row keeps whatever status the admin set unless patched).
  async function writeMarker({ noteLine, patch = {}, insert = {} }) {
    if (existing) {
      const { error } = await admin
        .from('operator_outreach')
        .update({
          notes: existing.notes ? `${existing.notes}\n${noteLine}` : noteLine,
          updated_at: now,
          ...patch,
        })
        .eq('id', existing.id)
      if (error) console.error('[picks] reciprocity outreach update failed:', error.message)
    } else {
      const { error } = await admin
        .from('operator_outreach')
        .insert({ listing_id: pickedId, notes: noteLine, created_at: now, updated_at: now, ...insert })
      if (error) console.error('[picks] reciprocity outreach insert failed:', error.message)
    }
  }

  // Claim state of the PICKED listing — active preferred over past_due grace
  // (migration 204: past_due keeps benefits live while Stripe retries).
  const { data: claims, error: claimErr } = await admin
    .from('listing_claims')
    .select('status, claimant_email')
    .eq('listing_id', pickedId)
    .in('status', ['active', 'past_due'])
  if (claimErr) {
    console.error('[picks] reciprocity claim lookup failed:', claimErr.message)
    return
  }
  const claim =
    (claims || []).find(c => c.status === 'active') ||
    (claims || [])[0] ||
    null

  if (claim?.claimant_email) {
    // CLAIMED — send the branded reciprocity email, then record the marker so
    // this venue is never emailed about the same picker again. If the send
    // didn't happen (e.g. RESEND_API_KEY unset) no marker is written, so the
    // pair stays eligible once email is configured.
    const message = pickRecommendationEmail({
      pickerName: curatorName,
      pickedName,
      pickedSlug,
    })
    const { sent } = await sendPicksEmail(claim.claimant_email, message)
    if (!sent) return
    await writeMarker({
      noteLine: `${marker} — ${curatorName} recommended this venue (Producer Pick); reciprocity email sent ${today}`,
      patch: { status: 'claimed', last_contacted_at: now },
      insert: { status: 'claimed', contact_email: claim.claimant_email, last_contacted_at: now },
    })
  } else {
    // UNCLAIMED — queue social proof for admin outreach.
    await writeMarker({
      noteLine: `${marker} — ${curatorName} recommended this venue (Producer Pick, ${today}); cite as social proof in outreach`,
      insert: { status: 'not_contacted' },
    })
  }
}

// POST — create a pick. Body: { curatorListingId, pickedListingId, note? }.
// The curator listing must be owned by the signed-in user.
export async function POST(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { curatorListingId, pickedListingId, note } = body || {}

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)
  if (!myIds.includes(curatorListingId)) {
    return NextResponse.json({ error: 'You can only add picks for a listing you own' }, { status: 403 })
  }

  const result = await createPick(admin, {
    curatorId: curatorListingId,
    pickedId: pickedListingId,
    note,
    source: 'operator',
    createdBy: 'operator',
  })

  if (!result.ok) {
    const status = result.code === 'cap' ? 409 : result.code === 'duplicate' ? 409 : 400
    return NextResponse.json({ error: result.error, code: result.code }, { status })
  }

  // Reciprocity loop — fire-and-forget: kicked off BEFORE the revalidate await
  // so it runs concurrently, with every rejection caught here. Awaiting the
  // already-caught promise below costs (almost) no extra latency, can never
  // throw or change the response, and guarantees the email/outreach work isn't
  // cut off when the serverless function is frozen after responding.
  const reciprocity = runPickReciprocity(admin, result.pick).catch(err => {
    console.error('[picks] reciprocity loop failed:', err?.message || err)
  })

  await revalidatePlacePages(admin, [curatorListingId, pickedListingId])
  await reciprocity
  return NextResponse.json({ pick: result.pick })
}

// DELETE — remove one of the operator's own picks. Body: { id } or ?id=.
export async function DELETE(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  let id = searchParams.get('id')
  if (!id) {
    try { id = (await request.json())?.id } catch { /* no body */ }
  }
  if (!id) return NextResponse.json({ error: 'Missing pick id' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)

  // Confirm the pick was made by one of the user's listings before deleting.
  const { data: rel } = await admin
    .from('listing_relationships')
    .select('id, listing_id_a, listing_id_b')
    .eq('id', id)
    .maybeSingle()
  if (!rel || !myIds.includes(rel.listing_id_a)) {
    return NextResponse.json({ error: 'Pick not found' }, { status: 404 })
  }

  const result = await deletePick(admin, { id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  await revalidatePlacePages(admin, [rel.listing_id_a, rel.listing_id_b])
  return NextResponse.json({ success: true, deletedId: id })
}
