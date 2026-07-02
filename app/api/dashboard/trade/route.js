import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * /api/dashboard/trade — Atlas Trade opt-in for a claimed listing.
 *
 * Operators author the trade-readiness profile (migration 170) for a listing
 * they own: trade_welcome is the master switch, the rest are the details the
 * trade builder surfaces alongside their standard listing. These fields NEVER
 * affect visitor-facing search, map, or discovery ranking — the trade builder
 * consumes the trade_buildable_listings view as enrichment only (lib/trade/enrich.js).
 *
 * Auth: Bearer atlas shared JWT (same as the rest of the dashboard). The caller
 * must own the listing (active listing_claims.claimed_by) — admins bypass — and,
 * for any write, hold a PAID claim (live standard claim via isListingPaid).
 * Reads are allowed for any owner so the locked state can be shown with the
 * right context.
 *
 * The trade_* columns are master-only (never written by the inbound vertical
 * sync — "safe by omission", see migration 170), so a direct listings write is
 * sync-safe with no vertical push.
 *
 *   GET   ?listing_id=…  → { listing, paid, trade }
 *   PATCH { listing_id, trade_welcome?, trade_group?, trade_group_size_max?,
 *           trade_bespoke?, trade_rates_available?, trade_contact_before_booking? }
 */

// The EXACT writable column set — nothing outside this list is ever written.
const BOOL_FIELDS = [
  'trade_welcome',
  'trade_group',
  'trade_bespoke',
  'trade_rates_available',
  'trade_contact_before_booking',
]
const GROUP_SIZE_MAX = 999 // sane ceiling for a trade group

const TRADE_SELECT =
  'trade_welcome, trade_group, trade_group_size_max, trade_bespoke, trade_rates_available, trade_contact_before_booking'

// True if `userId` holds an active ownership claim on `listingId`.
async function ownsListing(sb, listingId, userId) {
  const { data } = await sb
    .from('listing_claims')
    .select('id')
    .eq('listing_id', listingId)
    .eq('claimed_by', userId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

async function authOperator(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) return { error: 'Invalid token', status: 401 }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return { error: 'Vendor role required', status: 403 }
  }
  return { user, sb: getSupabaseAdmin() }
}

function tradeShape(row) {
  return {
    trade_welcome: !!row.trade_welcome,
    trade_group: !!row.trade_group,
    trade_group_size_max: row.trade_group_size_max ?? null,
    trade_bespoke: !!row.trade_bespoke,
    trade_rates_available: !!row.trade_rates_available,
    trade_contact_before_booking: !!row.trade_contact_before_booking,
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const auth = await authOperator(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, sb } = auth

  const listingId = new URL(request.url).searchParams.get('listing_id')
  if (!listingId) return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })

  if (user.role !== 'admin' && !(await ownsListing(sb, listingId, user.id))) {
    return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
  }

  const { data: listing, error } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, ${TRADE_SELECT}`)
    .eq('id', listingId)
    .maybeSingle()

  if (error) {
    // Forward-compat: trade columns absent until migration 170 is applied.
    if (error.code === '42703') {
      return NextResponse.json({ error: 'Atlas Trade opt-in isn’t switched on yet — please try again shortly.' }, { status: 503 })
    }
    console.error('[dashboard/trade] load error:', error.message)
    return NextResponse.json({ error: 'Failed to load trade settings' }, { status: 500 })
  }
  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  const paid = await isListingPaid(sb, listingId)

  return NextResponse.json({
    listing: { id: listing.id, name: listing.name, slug: listing.slug, vertical: listing.vertical },
    paid,
    trade: tradeShape(listing),
  })
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(request) {
  const auth = await authOperator(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, sb } = auth

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const listingId = body.listing_id
  if (!listingId) return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })

  if (user.role !== 'admin' && !(await ownsListing(sb, listingId, user.id))) {
    return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
  }

  // Trade opt-in is a paid feature — same server-side backstop as listing
  // editing, so a free operator can't PATCH this route directly. Admins bypass.
  if (user.role !== 'admin' && !(await isListingPaid(sb, listingId))) {
    return NextResponse.json(
      { error: 'Atlas Trade opt-in is a Standard-plan feature. Complete your payment to unlock it.', code: 'payment_required', upgrade: true },
      { status: 402 }
    )
  }

  // ── Allowlist + type validation: ONLY the trade_* columns, nothing else ─────
  const updates = {}
  for (const field of BOOL_FIELDS) {
    if (!(field in body)) continue
    if (typeof body[field] !== 'boolean') {
      return NextResponse.json({ error: `${field} must be true or false` }, { status: 400 })
    }
    updates[field] = body[field]
  }
  if ('trade_group_size_max' in body) {
    const v = body.trade_group_size_max
    if (v === null || v === '') {
      updates.trade_group_size_max = null
    } else if (Number.isInteger(v) && v >= 1 && v <= GROUP_SIZE_MAX) {
      updates.trade_group_size_max = v
    } else {
      return NextResponse.json({ error: `trade_group_size_max must be a whole number between 1 and ${GROUP_SIZE_MAX}, or null` }, { status: 400 })
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No trade fields to update' }, { status: 400 })
  }

  const { data: fresh, error } = await sb
    .from('listings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .select(TRADE_SELECT)
    .maybeSingle()

  if (error) {
    // Forward-compat: trade columns absent until migration 170 is applied.
    if (error.code === '42703') {
      return NextResponse.json({ error: 'Atlas Trade opt-in isn’t switched on yet — please try again shortly.' }, { status: 503 })
    }
    console.error('[dashboard/trade] update error:', error.message)
    return NextResponse.json({ error: 'Failed to save trade settings' }, { status: 500 })
  }
  if (!fresh) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  return NextResponse.json({ success: true, trade: tradeShape(fresh) })
}
