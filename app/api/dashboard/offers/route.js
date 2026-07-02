import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * /api/dashboard/offers — operator self-service "Current offers" for a
 * claimed listing (migration 208, table listing_offers).
 *
 * Auth: Bearer atlas shared JWT (same contract as /api/dashboard/events).
 * Caller must be admin, or the OWNER of the listing — an active
 * listing_claims row whose claimed_by is the authenticated user.
 *
 * Offers are a PAID perk: creating one requires an active standard claim
 * (isListingPaid — past_due dunning grace counts; admins bypass), the same
 * gate as the photo gallery and events. Deleting is always allowed so a
 * lapsed operator can still take an offer down.
 *
 * A listing can run at most MAX_LIVE_OFFERS live, unexpired offers at a time.
 * An offer is publicly visible while status='live' AND valid_to >= today —
 * expiry is self-enforcing at the read layer (see migration 208), so no
 * status flip is needed when a date passes. DELETE is a soft delete
 * (status='removed').
 *
 *   GET    ?listing_id=          → every non-removed offer (owner view)
 *   POST   { listing_id, ... }   → create (title + valid_to required)
 *   DELETE ?id=&listing_id=      → soft-remove
 *
 * NOTE: pay-to-win guard — offers render as an operator-attributed block on
 * /place/[slug] only. Nothing here (or anywhere) may feed ranking.
 */

const MAX_LIVE_OFFERS = 3
const MAX_TITLE = 80
const MAX_DETAILS = 400
const MAX_URL = 500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const SELECT_COLS = 'id, listing_id, title, details, url, valid_from, valid_to, status, created_at'

// Today as a local YYYY-MM-DD — valid_from/valid_to are DATE columns, and an
// offer ending today still counts as live (mirrors lib/events.js todayYMD).
function todayYMD() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-31 etc.).
function isValidDate(s) {
  if (!DATE_RE.test(s || '')) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Normalise an operator-supplied link to https. Returns null for empty,
// a clean URL string, or undefined when the value can't be a valid http(s)
// URL (the caller 400s on undefined).
function cleanOfferUrl(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    const out = u.toString()
    return out.length <= MAX_URL ? out : undefined
  } catch {
    return undefined
  }
}

// Verify the token + ownership of the listing (mirrors /api/dashboard/events).
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

// Bust the ISR cache for the public place page an offer change affects.
function revalidateOffer(listingSlug) {
  try {
    if (listingSlug) revalidatePath(`/place/${listingSlug}`)
  } catch { /* best-effort cache busting */ }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  const auth = await authorize(request, listingId)
  if (auth.fail) return auth.fail

  try {
    const [{ data: offers, error }, paid] = await Promise.all([
      auth.sb
        .from('listing_offers')
        .select(SELECT_COLS)
        .eq('listing_id', listingId)
        .neq('status', 'removed')
        .order('valid_to', { ascending: true }),
      isPaid(auth.sb, auth.user, listingId),
    ])
    if (error) throw error
    return NextResponse.json({ offers: offers || [], paid, maxOffers: MAX_LIVE_OFFERS, today: todayYMD() })
  } catch (err) {
    console.error('[dashboard/offers] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 })
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Offers are a paid feature — upgrade this listing to add offers.' }, { status: 403 })
  }

  // ── Server-side validation (lengths mirror the CHECK constraints) ──
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Give your offer a title' }, { status: 400 })
  if (title.length > MAX_TITLE) {
    return NextResponse.json({ error: `Offer titles can be up to ${MAX_TITLE} characters` }, { status: 400 })
  }
  const details = body.details ? String(body.details).trim() : null
  if (details && details.length > MAX_DETAILS) {
    return NextResponse.json({ error: `Offer details can be up to ${MAX_DETAILS} characters` }, { status: 400 })
  }
  const url = cleanOfferUrl(body.url)
  if (url === undefined) {
    return NextResponse.json({ error: 'That link doesn’t look like a valid web address' }, { status: 400 })
  }

  const today = todayYMD()
  const validTo = body.valid_to
  if (!validTo || !isValidDate(validTo)) {
    return NextResponse.json({ error: 'Choose an end date for your offer' }, { status: 400 })
  }
  if (validTo < today) {
    return NextResponse.json({ error: 'The end date has already passed — choose a future date' }, { status: 400 })
  }
  const validFrom = body.valid_from || null
  if (validFrom && !isValidDate(validFrom)) {
    return NextResponse.json({ error: 'The start date isn’t a valid date' }, { status: 400 })
  }
  if (validFrom && validFrom > validTo) {
    return NextResponse.json({ error: 'The offer can’t start after it ends' }, { status: 400 })
  }

  try {
    // Per-listing cap on LIVE, unexpired offers. A count-then-insert race
    // could briefly exceed it; the cap is a product guardrail, not an
    // invariant (same stance as events).
    const { count } = await auth.sb
      .from('listing_offers')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', auth.listing.id)
      .eq('status', 'live')
      .gte('valid_to', today)
    if ((count || 0) >= MAX_LIVE_OFFERS) {
      return NextResponse.json({
        error: `Each listing can run up to ${MAX_LIVE_OFFERS} offers at a time — remove one to add another.`,
      }, { status: 400 })
    }

    const { data: offer, error } = await auth.sb
      .from('listing_offers')
      .insert({
        listing_id: auth.listing.id,
        title,
        details,
        url,
        valid_from: validFrom,
        valid_to: validTo,
        status: 'live',
      })
      .select(SELECT_COLS)
      .single()
    if (error) throw error

    revalidateOffer(auth.listing.slug)
    return NextResponse.json({ offer })
  } catch (err) {
    console.error('[dashboard/offers] POST error:', err.message)
    return NextResponse.json({ error: 'Failed to save offer' }, { status: 500 })
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
  if (!id) return NextResponse.json({ error: 'Missing offer id' }, { status: 400 })

  try {
    // Soft delete: keeps the row as an audit trail; the anon policy and the
    // public read both exclude 'removed'.
    const { data, error } = await auth.sb
      .from('listing_offers')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('listing_id', auth.listing.id)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }
    revalidateOffer(auth.listing.slug)
    return NextResponse.json({ success: true, deletedId: id })
  } catch (err) {
    console.error('[dashboard/offers] DELETE error:', err.message)
    return NextResponse.json({ error: 'Failed to remove offer' }, { status: 500 })
  }
}
