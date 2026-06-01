import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { updateListing } from '@/lib/admin/updateListing'

/**
 * PATCH /api/dashboard/listing — operator self-service edit of a claimed listing.
 *
 * Auth: Bearer atlas shared JWT. Caller must be vendor (managing the listing's
 * vertical) or admin. Ownership is enforced against listings.is_claimed plus the
 * token's vendor_verticals — NOT the listing_claims table (that ownership model
 * is unpopulated; the Overview/dashboard auth model is the working one).
 *
 * Body: { listing_id, website?, phone?, hours?, hero_image_url? }
 *
 * website / phone / hero_image_url flow through the canonical updateListing(),
 * which writes master AND pushes to the vertical source DB — so the next inbound
 * sync is a no-op diff and the edit survives. hours is written directly to
 * listings.hours (JSONB): the inbound field maps never set listings.hours, so a
 * master-only write is sync-safe by omission (same contract as description).
 */

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/ // 24h HH:MM — matches OpeningHours/jsonLd expectations

/**
 * Normalise an incoming hours object into the shape the public renderer expects:
 *   { monday: { open: "HH:MM", close: "HH:MM" }, ... }  (closed days omitted)
 * Returns { ok: true, hours } (hours may be null = no hours) or { ok: false, error }.
 */
function normaliseHours(input) {
  if (input == null) return { ok: true, hours: null }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'hours must be an object keyed by weekday' }
  }
  const out = {}
  for (const day of DAY_KEYS) {
    const v = input[day]
    if (!v) continue // falsy / absent → closed
    if (typeof v !== 'object' || !v.open || !v.close) {
      return { ok: false, error: `Invalid hours for ${day}` }
    }
    if (!TIME_RE.test(v.open) || !TIME_RE.test(v.close)) {
      return { ok: false, error: `Times for ${day} must be HH:MM (24-hour)` }
    }
    out[day] = { open: v.open, close: v.close }
  }
  return { ok: true, hours: Object.keys(out).length ? out : null }
}

export async function PATCH(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const listingId = body.listing_id
  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing_id' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // ── Ownership: listing must exist, be claimed, and (for vendors) be in a
  //    vertical this operator manages. Admins bypass the vertical check. ──
  const { data: owned, error: ownErr } = await sb
    .from('listings')
    .select('id, vertical, is_claimed')
    .eq('id', listingId)
    .single()

  if (ownErr || !owned) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  if (!owned.is_claimed) {
    return NextResponse.json({ error: 'Listing is not claimed' }, { status: 403 })
  }
  if (user.role !== 'admin' && !(user.verticals || {})[owned.vertical]) {
    return NextResponse.json({ error: 'You do not manage this listing' }, { status: 403 })
  }

  // ── Base fields → canonical updateListing (master write + vertical sync-back) ──
  const baseUpdates = {}
  if ('website' in body) baseUpdates.website = body.website
  if ('phone' in body) baseUpdates.phone = body.phone === '' ? null : body.phone
  if ('hero_image_url' in body) baseUpdates.hero_image_url = body.hero_image_url || null

  let verticalSync = null
  if (Object.keys(baseUpdates).length > 0) {
    const result = await updateListing(listingId, baseUpdates, { action: 'operator-edit' })
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 400 })
    }
    verticalSync = result.verticalSync
  }

  // ── hours → master-only write (listings.hours is never set by inbound sync) ──
  if ('hours' in body) {
    const norm = normaliseHours(body.hours)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    const { error: hoursErr } = await sb
      .from('listings')
      .update({ hours: norm.hours, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (hoursErr) {
      return NextResponse.json({ error: `Failed to save hours: ${hoursErr.message}` }, { status: 400 })
    }
  }

  const { data: fresh } = await sb
    .from('listings')
    .select('id, name, slug, vertical, website, phone, hours, hero_image_url, description, is_claimed, status')
    .eq('id', listingId)
    .single()

  return NextResponse.json({ success: true, listing: fresh, verticalSync })
}
