import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isApprovedImageSource } from '@/lib/image-utils'
import { isListingPaid } from '@/lib/listing-gallery'
import { listEventsForListing, createEvent, updateEvent, deleteEvent } from '@/lib/events'

/**
 * /api/dashboard/events — operator self-service events for a claimed listing.
 *
 * Auth: Bearer atlas shared JWT (same contract as /api/dashboard/listing).
 * Caller must be vendor (managing the listing's vertical) or admin. Ownership is
 * enforced against listings.is_claimed + the token's verticals — the working
 * editor model (NOT listing_claims).
 *
 * Events are a PAID perk: writes require an active standard claim (isListingPaid;
 * admins bypass) — the same gate as the photo gallery. When published, an event
 * surfaces on /place/[slug] (its hosting listing) and the public /events index.
 * state/region are copied from the hosting listing so /events can filter by
 * state without a join.
 *
 *   GET    ?listing_id=             → every event for the listing (owner view)
 *   POST   { listing_id, ... }      → create
 *   PATCH  { id, listing_id, ... }  → update
 *   DELETE ?id=&listing_id=         → delete
 */

const EDITABLE_KEYS = ['title', 'description', 'category', 'start_date', 'end_date', 'ticket_url', 'is_free', 'hero_image_url', 'published']

// Verify the token + ownership of the listing. Returns { fail } (a response) on
// any failure, or { sb, user, listing } on success.
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
    .select('id, vertical, is_claimed, slug, name, state, region')
    .eq('id', listingId)
    .single()
  if (error || !listing) return { fail: NextResponse.json({ error: 'Listing not found' }, { status: 404 }) }
  if (!listing.is_claimed) return { fail: NextResponse.json({ error: 'Listing is not claimed' }, { status: 403 }) }
  if (user.role !== 'admin' && !(user.verticals || {})[listing.vertical]) {
    return { fail: NextResponse.json({ error: 'You do not manage this listing' }, { status: 403 }) }
  }
  return { sb, user, listing }
}

async function isPaid(sb, user, listingId) {
  if (user.role === 'admin') return true
  return isListingPaid(sb, listingId)
}

// Bust the ISR cache for every surface an event change can affect.
function revalidateEvent(listingSlug, eventSlug) {
  try {
    revalidatePath('/events')
    if (listingSlug) revalidatePath(`/place/${listingSlug}`)
    if (eventSlug) revalidatePath(`/events/${eventSlug}`)
  } catch { /* best-effort cache busting */ }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  const auth = await authorize(request, listingId)
  if (auth.fail) return auth.fail

  const [events, paid] = await Promise.all([
    listEventsForListing(auth.sb, listingId, { includeUnpublished: true }),
    isPaid(auth.sb, auth.user, listingId),
  ])
  return NextResponse.json({ events, paid })
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Events are a paid feature — upgrade this listing to add events.' }, { status: 403 })
  }
  if (body.hero_image_url && !isApprovedImageSource(body.hero_image_url)) {
    return NextResponse.json({ error: 'Event images must be uploaded through the editor' }, { status: 400 })
  }

  const result = await createEvent(auth.sb, {
    listingId: auth.listing.id,
    createdBy: auth.user.id,
    title: body.title,
    description: body.description,
    category: body.category,
    startDate: body.start_date,
    endDate: body.end_date,
    ticketUrl: body.ticket_url,
    isFree: body.is_free,
    heroImageUrl: body.hero_image_url,
    published: body.published,
    state: auth.listing.state,
    region: auth.listing.region,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.code === 'duplicate' ? 409 : 400 })
  }
  revalidateEvent(auth.listing.slug, result.event.slug)
  return NextResponse.json({ event: result.event })
}

export async function PATCH(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'Events are a paid feature — upgrade this listing to add events.' }, { status: 403 })
  }
  if (!body.id) return NextResponse.json({ error: 'Missing event id' }, { status: 400 })
  if (body.hero_image_url && !isApprovedImageSource(body.hero_image_url)) {
    return NextResponse.json({ error: 'Event images must be uploaded through the editor' }, { status: 400 })
  }

  const fields = {}
  for (const k of EDITABLE_KEYS) if (k in body) fields[k] = body[k]

  const result = await updateEvent(auth.sb, { id: body.id, listingId: auth.listing.id, fields })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.code === 'not_found' ? 404 : 400 })
  }
  revalidateEvent(auth.listing.slug, result.event.slug)
  return NextResponse.json({ event: result.event })
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
  if (!id) return NextResponse.json({ error: 'Missing event id' }, { status: 400 })

  const result = await deleteEvent(auth.sb, { id, listingId: auth.listing.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.code === 'not_found' ? 404 : 400 })
  }
  revalidateEvent(auth.listing.slug, result.slug)
  return NextResponse.json({ success: true, deletedId: result.deletedId })
}
