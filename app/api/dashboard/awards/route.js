import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * /api/dashboard/awards — operator self-service "Recognition" entries for a
 * claimed listing (migration 208, table listing_awards).
 *
 * Auth: Bearer atlas shared JWT (same contract as /api/dashboard/events).
 * Caller must be admin, or the OWNER of the listing — an active
 * listing_claims row whose claimed_by is the authenticated user.
 *
 * Recognition is a PAID perk: adding an entry requires an active standard
 * claim (isListingPaid — past_due dunning grace counts; admins bypass), the
 * same gate as the photo gallery and events. Deleting is always allowed so a
 * lapsed operator can still take an entry down.
 *
 * A listing can list at most MAX_AWARDS entries. The legacy listings.awards
 * column is ignored entirely — this table is the sole source.
 *
 *   GET    ?listing_id=          → every award for the listing (owner view)
 *   POST   { listing_id, ... }   → create (title required)
 *   DELETE ?id=&listing_id=      → delete
 *
 * NOTE: pay-to-win guard — awards render as an operator-attributed block on
 * /place/[slug] only. Nothing here (or anywhere) may feed ranking.
 */

const MAX_AWARDS = 10
const MAX_TITLE = 120
const MAX_AWARDED_BY = 120
const MAX_URL = 500

const SELECT_COLS = 'id, listing_id, title, awarded_by, year, source_url, created_at'

// Normalise an operator-supplied link to https. Returns null for empty,
// a clean URL string, or undefined when the value can't be a valid http(s)
// URL (the caller 400s on undefined).
function cleanSourceUrl(raw) {
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
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
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

// Bust the ISR cache for the public place page an award change affects.
function revalidateAward(listingSlug) {
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
    const [{ data: awards, error }, paid] = await Promise.all([
      auth.sb
        .from('listing_awards')
        .select(SELECT_COLS)
        .eq('listing_id', listingId)
        .order('year', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      isPaid(auth.sb, auth.user, listingId),
    ])
    if (error) throw error
    return NextResponse.json({ awards: awards || [], paid, maxAwards: MAX_AWARDS })
  } catch (err) {
    console.error('[dashboard/awards] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to load recognition entries' }, { status: 500 })
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Recognition is a paid feature — upgrade this listing to add awards.' }, { status: 403 })
  }

  // ── Server-side validation (lengths mirror the CHECK constraints) ──
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Give the award or recognition a title' }, { status: 400 })
  if (title.length > MAX_TITLE) {
    return NextResponse.json({ error: `Award titles can be up to ${MAX_TITLE} characters` }, { status: 400 })
  }
  const awardedBy = body.awarded_by ? String(body.awarded_by).trim().slice(0, MAX_AWARDED_BY) : null
  const sourceUrl = cleanSourceUrl(body.source_url)
  if (sourceUrl === undefined) {
    return NextResponse.json({ error: 'That link doesn’t look like a valid web address' }, { status: 400 })
  }
  let year = null
  if (body.year !== undefined && body.year !== null && body.year !== '') {
    year = Number.parseInt(body.year, 10)
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return NextResponse.json({ error: 'Year must be between 1900 and 2100' }, { status: 400 })
    }
  }

  try {
    // Per-listing cap. A count-then-insert race could briefly exceed it; the
    // cap is a product guardrail, not an invariant (same stance as events).
    const { count } = await auth.sb
      .from('listing_awards')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', auth.listing.id)
    if ((count || 0) >= MAX_AWARDS) {
      return NextResponse.json({
        error: `Each listing can show up to ${MAX_AWARDS} recognition entries — remove one to add another.`,
      }, { status: 400 })
    }

    const { data: award, error } = await auth.sb
      .from('listing_awards')
      .insert({
        listing_id: auth.listing.id,
        title,
        awarded_by: awardedBy,
        year,
        source_url: sourceUrl,
      })
      .select(SELECT_COLS)
      .single()
    if (error) throw error

    revalidateAward(auth.listing.slug)
    return NextResponse.json({ award })
  } catch (err) {
    console.error('[dashboard/awards] POST error:', err.message)
    return NextResponse.json({ error: 'Failed to save recognition entry' }, { status: 500 })
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
  if (!id) return NextResponse.json({ error: 'Missing award id' }, { status: 400 })

  try {
    const { data, error } = await auth.sb
      .from('listing_awards')
      .delete()
      .eq('id', id)
      .eq('listing_id', auth.listing.id)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Recognition entry not found' }, { status: 404 })
    }
    revalidateAward(auth.listing.slug)
    return NextResponse.json({ success: true, deletedId: id })
  } catch (err) {
    console.error('[dashboard/awards] DELETE error:', err.message)
    return NextResponse.json({ error: 'Failed to remove recognition entry' }, { status: 500 })
  }
}
