import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeTasteVector } from '@/lib/discover/tasteVector'
import { deriveTasteReflection, shouldShowReflection } from '@/lib/discover/tasteReflection'
import { getPublicVerticals } from '@/lib/verticalUrl'

// Card payload: everything the floating card renders. presence_type is NOT
// here — reflection is derived server-side (below) where we can read it.
const CARD_FIELDS = 'id, name, slug, vertical, sub_type, description, region, state, suburb, hero_image_url'

const DEFAULT_LIMIT = 10
const MAX_MATCH = 100

/** Require a meaningful description (Supabase can't word-count in SQL). */
function hasGoodDescription(l) {
  if (!l?.description) return false
  return l.description.trim().split(/\s+/).length > 20
}

function trimCard(l) {
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    sub_type: l.sub_type,
    description: l.description,
    region: l.region,
    state: l.state,
    suburb: l.suburb,
    hero_image_url: l.hero_image_url,
  }
}

/**
 * POST /api/discover/feed
 *
 * Body: {
 *   pickedIds:  string[]   // "I'd visit this"
 *   skippedIds: string[]   // "Next"
 *   seenIds:    string[]   // everything already served this session
 *   swipeCount: number     // total swipes (for the reflection threshold)
 *   limit?:     number
 *   lat?, lng?: number     // optional, for cold-start proximity bias
 * }
 *
 * Returns: { listings, reflection, coldStart }
 *
 * The server holds NO session state — the client posts its in-memory id sets
 * each request. Identical mechanic for anonymous and logged-in users.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const pickedIds = Array.isArray(body.pickedIds) ? body.pickedIds.map(String) : []
  const skippedIds = Array.isArray(body.skippedIds) ? body.skippedIds.map(String) : []
  const seenIds = Array.isArray(body.seenIds) ? body.seenIds.map(String) : []
  const swipeCount = Number.isFinite(body.swipeCount) ? body.swipeCount : seenIds.length
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || DEFAULT_LIMIT, 1), 24)
  const lat = Number.isFinite(body.lat) ? body.lat : null
  const lng = Number.isFinite(body.lng) ? body.lng : null

  const seen = new Set(seenIds)
  // Picks/skips are always seen even if the client's seenIds lags behind.
  pickedIds.forEach((id) => seen.add(id))
  skippedIds.forEach((id) => seen.add(id))

  const sb = getSupabaseAdmin()

  // ── Taste vector (cold start when no picks yet) ─────────────────────
  const { literal: taste, error: tasteError } = await computeTasteVector(sb, pickedIds, skippedIds)
  if (tasteError) {
    return NextResponse.json({ error: `Taste ranking failed: ${tasteError}` }, { status: 500 })
  }

  // ── Reflection (server-side, reusable function) ─────────────────────
  let reflection = null
  if (shouldShowReflection(swipeCount, pickedIds.length)) {
    const { data: pickedRows, error: pickErr } = await sb
      .from('listings')
      .select('id, vertical, region, state, presence_type')
      .in('id', pickedIds)
    if (pickErr) {
      return NextResponse.json({ error: `Reflection read failed: ${pickErr.message}` }, { status: 500 })
    }
    reflection = deriveTasteReflection(pickedRows || [])
  }

  // ── Next batch ──────────────────────────────────────────────────────
  let listings
  const coldStart = !taste
  try {
    listings = taste
      ? await rankedBatch(sb, taste, seen, limit)
      : await coldStartBatch(sb, seen, limit, lat, lng)
  } catch (err) {
    return NextResponse.json({ error: `Feed query failed: ${err.message}` }, { status: 500 })
  }

  return NextResponse.json({
    listings,
    reflection,
    coldStart,
    exhausted: listings.length === 0,
  })
}

/**
 * Taste path: nearest listings to the taste vector via the canonical hybrid
 * RPC (semantic arm only — query_text null, floor 0 = pure nearest-neighbour,
 * the same shape /api/similar uses). The RPC has no exclude-ids param, so we
 * over-fetch and drop seen ids in JS.
 */
async function rankedBatch(sb, taste, seen, limit) {
  const matchCount = Math.min(MAX_MATCH, limit + seen.size + 20)
  const { data, error } = await sb.rpc('search_listings_hybrid', {
    query_embedding: taste,
    query_text: null,
    match_count: matchCount,
    similarity_floor: 0.0,
    min_quality: 40,
    include_way: true,
  })
  if (error) throw new Error(error.message)

  const out = []
  for (const l of data || []) {
    if (seen.has(String(l.id))) continue
    if (!hasGoodDescription(l)) continue
    out.push(trimCard(l))
    if (out.length >= limit) break
  }
  return out
}

/**
 * Cold start (no picks yet): seed for vertical diversity so the taste vector
 * gathers signal across categories fast. We sample each vertical independently
 * (a global quality-ordered pool would starve lower-scoring verticals), then
 * round-robin so the served batch spans as many categories as possible. If a
 * location is known, each vertical's sample is lightly biased toward nearby
 * venues (bbox-first, national fallback).
 */
async function coldStartBatch(sb, seen, limit, lat, lng) {
  const verticals = getPublicVerticals()
  const bbox = (lat != null && lng != null)
    ? { latMin: lat - 3, latMax: lat + 3, lngMin: lng - 3, lngMax: lng + 3 }
    : null
  const perVertical = Math.max(2, Math.ceil(limit / 2))

  const samples = await Promise.all(
    verticals.map((v) => fetchVerticalSample(sb, v, perVertical, bbox, seen))
  )

  const byVertical = {}
  verticals.forEach((v, i) => { byVertical[v] = samples[i] })

  // Round-robin across verticals for maximum spread in the served batch.
  const order = verticals.filter((v) => byVertical[v]?.length)
  const out = []
  let added = true
  while (out.length < limit && added) {
    added = false
    for (const v of order) {
      const next = byVertical[v].shift()
      if (next) {
        out.push(trimCard(next))
        added = true
        if (out.length >= limit) break
      }
    }
  }
  return out
}

/**
 * Top-quality sample for ONE vertical, good-description-gated and unseen.
 * With a bbox we lead with nearby venues and fall back nationally to fill.
 */
async function fetchVerticalSample(sb, vertical, n, bbox, seen) {
  const out = []
  const used = new Set()

  const take = (rows) => {
    for (const l of rows || []) {
      const id = String(l.id)
      if (seen.has(id) || used.has(id)) continue
      if (!hasGoodDescription(l)) continue
      used.add(id)
      out.push(l)
      if (out.length >= n) break
    }
  }

  if (bbox) take(await fetchVerticalRows(sb, vertical, bbox))
  if (out.length < n) take(await fetchVerticalRows(sb, vertical, null))
  return out
}

async function fetchVerticalRows(sb, vertical, bbox) {
  let q = sb
    .from('listings')
    .select(CARD_FIELDS + ', quality_score')
    .eq('status', 'active')
    .eq('vertical', vertical)
    .gte('quality_score', 40)
    .or('geocode_confidence.is.null,geocode_confidence.neq.low')
    .not('description', 'is', null)
    .order('quality_score', { ascending: false })
    .limit(40)

  if (bbox) {
    q = q
      .gte('lat', bbox.latMin).lte('lat', bbox.latMax)
      .gte('lng', bbox.lngMin).lte('lng', bbox.lngMax)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}
