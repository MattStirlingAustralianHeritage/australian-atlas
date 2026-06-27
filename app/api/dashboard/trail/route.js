import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { recomputeTotals } from '@/lib/trails/totals'

/**
 * /api/dashboard/trail — operator-suggested trail authoring.
 *
 * A claimed + PAID operator authors ONE "suggested trail" scoped to their
 * listing's region. The trail lives on the canonical trails / trail_stops store
 * as type='operator' (distinct from Atlas editorial region trails and community
 * user trails) and surfaces only on the operator's own listing page.
 *
 * Auth: Bearer atlas shared JWT (same as the rest of the dashboard). The caller
 * must own the listing (active listing_claims.claimed_by) — admins bypass — and,
 * for any write or publish, hold a PAID claim (status='active' AND tier='standard',
 * via isListingPaid). Reads are allowed for any owner so the locked state can be
 * shown with the right context.
 *
 *   GET    ?listing_id=…  → { listing, paid, trail|null }
 *   PUT    { listing_id, title, intro?, stops:[{listing_id, note?}], publish }
 *   DELETE ?listing_id=…  → unpublish (visibility→private; the draft is kept)
 */

const MAX_STOPS = 12
const MIN_STOPS = 2
const TITLE_MAX = 120
const INTRO_MAX = 700
const NOTE_MAX = 240

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

// Load the operator's listing with its resolved region. Returns null if missing.
async function loadOwnerListing(sb, listingId) {
  const { data } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, status, ${LISTING_REGION_SELECT}`)
    .eq('id', listingId)
    .maybeSingle()
  if (!data) return null
  const region = getListingRegion(data)
  return { listing: data, region }
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueTrailSlug(sb, base) {
  const root = slugify(base) || 'trail'
  for (let i = 0; i < 30; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`
    const { data } = await sb.from('trails').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${root}-${Date.now()}`
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

  const owner = await loadOwnerListing(sb, listingId)
  if (!owner) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  const paid = await isListingPaid(sb, listingId)

  // Operator's single trail for this listing (draft OR published).
  const { data: trail } = await sb
    .from('trails')
    .select('id, slug, title, intro, visibility, region_id, region, stop_count, updated_at')
    .eq('listing_id', listingId)
    .eq('type', 'operator')
    .maybeSingle()

  let stops = []
  if (trail) {
    const { data: rows } = await sb
      .from('trail_stops')
      .select('position, editorial_copy, listing_id, venue_name, vertical, venue_lat, venue_lng, venue_image_url')
      .eq('trail_id', trail.id)
      .order('position', { ascending: true })
    stops = (rows || []).map(r => ({
      listing_id: r.listing_id,
      name: r.venue_name,
      vertical: r.vertical,
      latitude: r.venue_lat,
      longitude: r.venue_lng,
      image_url: r.venue_image_url,
      note: r.editorial_copy || '',
    }))
  }

  return NextResponse.json({
    listing: {
      id: owner.listing.id,
      name: owner.listing.name,
      slug: owner.listing.slug,
      vertical: owner.listing.vertical,
      region: owner.region ? { id: owner.region.id, name: owner.region.name } : null,
    },
    paid,
    trail: trail
      ? {
          id: trail.id,
          slug: trail.slug,
          title: trail.title,
          intro: trail.intro || '',
          published: trail.visibility === 'public',
          stop_count: trail.stop_count,
          updated_at: trail.updated_at,
          stops,
        }
      : null,
  })
}

// ── PUT (create / update / publish) ──────────────────────────────────────────
export async function PUT(request) {
  const auth = await authOperator(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, sb } = auth

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const listingId = body.listing_id
  if (!listingId) return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })

  if (user.role !== 'admin' && !(await ownsListing(sb, listingId, user.id))) {
    return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
  }

  // Authoring + publishing are a paid feature. Admins bypass for support.
  if (user.role !== 'admin' && !(await isListingPaid(sb, listingId))) {
    return NextResponse.json(
      { error: 'Authoring a suggested trail is a Standard-plan feature. Complete your payment to unlock it.', code: 'payment_required', upgrade: true },
      { status: 402 }
    )
  }

  const owner = await loadOwnerListing(sb, listingId)
  if (!owner) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  if (!owner.region?.id) {
    return NextResponse.json({ error: "This listing has no resolved region yet, so a regional trail can't be scoped to it." }, { status: 400 })
  }
  const regionId = owner.region.id

  const title = String(body.title || '').trim().slice(0, TITLE_MAX)
  if (!title) return NextResponse.json({ error: 'A trail title is required' }, { status: 400 })
  const intro = String(body.intro || '').trim().slice(0, INTRO_MAX)
  const publish = body.publish === true

  // ── Resolve + validate stops ───────────────────────────────────────────────
  // Stops must be real, active, in-region listings — never free text. Dedupe by
  // listing id, preserving the operator's order.
  const rawStops = Array.isArray(body.stops) ? body.stops : []
  const seen = new Set()
  const requested = []
  for (const s of rawStops) {
    const id = s && s.listing_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    requested.push({ listing_id: id, note: String(s.note || '').trim().slice(0, NOTE_MAX) })
  }
  if (requested.length < MIN_STOPS) {
    return NextResponse.json({ error: `Add at least ${MIN_STOPS} stops before saving.` }, { status: 400 })
  }
  if (requested.length > MAX_STOPS) {
    return NextResponse.json({ error: `A trail can have at most ${MAX_STOPS} stops.` }, { status: 400 })
  }

  const { data: stopListings } = await sb
    .from('listings')
    .select('id, name, slug, vertical, lat, lng, hero_image_url, status, region_override_id, region_computed_id')
    .in('id', requested.map(s => s.listing_id))
  const byId = new Map((stopListings || []).map(l => [l.id, l]))

  const resolved = []
  for (const s of requested) {
    const l = byId.get(s.listing_id)
    if (!l || l.status !== 'active') {
      return NextResponse.json({ error: 'One of the stops is no longer an active listing. Remove it and try again.' }, { status: 400 })
    }
    const lRegion = l.region_override_id || l.region_computed_id
    if (lRegion !== regionId) {
      return NextResponse.json({ error: `"${l.name}" is outside your region — stops must stay within ${owner.region.name}.` }, { status: 400 })
    }
    if (l.lat == null || l.lng == null) {
      return NextResponse.json({ error: `"${l.name}" has no map location and can't be a stop.` }, { status: 400 })
    }
    resolved.push({ l, note: s.note })
  }

  // ── Upsert the single operator trail ───────────────────────────────────────
  const { data: existing } = await sb
    .from('trails')
    .select('id, slug, created_by')
    .eq('listing_id', listingId)
    .eq('type', 'operator')
    .maybeSingle()

  const visibility = publish ? 'public' : 'private'
  let trailId = existing?.id

  if (existing) {
    const { error } = await sb
      .from('trails')
      .update({
        title,
        intro,
        description: intro || null,
        visibility,
        region_id: regionId,
        region: owner.region.name || null,
        stop_count: resolved.length,
        published: false, // 'published' boolean is the editorial workflow flag; operator trails gate on visibility
        published_at: publish ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) {
      console.error('[dashboard/trail] update error:', error.message)
      return NextResponse.json({ error: 'Failed to save trail' }, { status: 500 })
    }
  } else {
    const slug = await uniqueTrailSlug(sb, `${owner.listing.slug || owner.listing.name}-trail`)
    const { data: inserted, error } = await sb
      .from('trails')
      .insert({
        type: 'operator',
        slug,
        title,
        intro,
        description: intro || null,
        visibility,
        created_by: user.id,
        listing_id: listingId,
        region_id: regionId,
        region: owner.region.name || null,
        transport_mode: 'drive',
        stop_count: resolved.length,
        published: false,
        published_at: publish ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error) {
      console.error('[dashboard/trail] insert error:', error.message)
      return NextResponse.json({ error: 'Failed to create trail' }, { status: 500 })
    }
    trailId = inserted.id
  }

  // ── Replace stops ──────────────────────────────────────────────────────────
  await sb.from('trail_stops').delete().eq('trail_id', trailId)
  const stopRows = resolved.map((r, i) => ({
    trail_id: trailId,
    listing_id: r.l.id,
    vertical: r.l.vertical,
    venue_name: r.l.name,
    venue_lat: r.l.lat,
    venue_lng: r.l.lng,
    venue_image_url: r.l.hero_image_url || null,
    position: i,
    editorial_copy: r.note || null,
  }))
  const { error: stopErr } = await sb.from('trail_stops').insert(stopRows)
  if (stopErr) {
    console.error('[dashboard/trail] stops insert error:', stopErr.message)
    return NextResponse.json({ error: 'Failed to save trail stops' }, { status: 500 })
  }

  await recomputeTotals(sb, trailId)

  return NextResponse.json({ ok: true, trail_id: trailId, published: publish })
}

// ── DELETE (unpublish — keeps the draft; no hard delete) ─────────────────────
export async function DELETE(request) {
  const auth = await authOperator(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, sb } = auth

  const listingId = new URL(request.url).searchParams.get('listing_id')
  if (!listingId) return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })

  if (user.role !== 'admin' && !(await ownsListing(sb, listingId, user.id))) {
    return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
  }

  const { error } = await sb
    .from('trails')
    .update({ visibility: 'private', published: false, published_at: null, updated_at: new Date().toISOString() })
    .eq('listing_id', listingId)
    .eq('type', 'operator')
  if (error) {
    console.error('[dashboard/trail] unpublish error:', error.message)
    return NextResponse.json({ error: 'Failed to unpublish trail' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, published: false })
}
