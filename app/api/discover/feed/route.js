import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { computeTasteVector } from '@/lib/discover/tasteVector'
import { getTasteProfile } from '@/lib/discover/getTasteProfile'
import { deriveTasteReflection, shouldShowReflection } from '@/lib/discover/tasteReflection'
import { getPublicVerticals } from '@/lib/verticalUrl'

// Card payload: everything the floating card renders. presence_type is NOT
// here — reflection is derived server-side (below) where we can read it.
const CARD_FIELDS = 'id, name, slug, vertical, sub_type, description, region, state, suburb, hero_image_url, presence_type'

const DEFAULT_LIMIT = 10
const MAX_MATCH = 100
// Never serve more than this many of the same vertical CONSECUTIVELY (counted
// across the session via recentVerticals, not just within one batch).
const MAX_RUN = 2
// And cap any single vertical's SHARE of a batch, so even a strongly-concentrated
// taste yields a genuine cross-section of verticals rather than a firehose of one.
const MAX_DOMINANT_SHARE = 0.4

/** Fisher–Yates shuffle (returns a copy). */
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Most frequent vertical in a list. */
function modeVertical(items) {
  const counts = {}
  let best = null, bestN = 0
  for (const it of items) {
    const n = (counts[it.vertical] = (counts[it.vertical] || 0) + 1)
    if (n > bestN) { bestN = n; best = it.vertical }
  }
  return best
}

/** Trailing same-vertical run from the recently-SERVED verticals (history). */
function tailRunState(recentVerticals) {
  if (!recentVerticals?.length) return { lastV: null, run: 0 }
  const lastV = recentVerticals[recentVerticals.length - 1]
  let run = 0
  for (let i = recentVerticals.length - 1; i >= 0; i--) {
    if (recentVerticals[i] === lastV) run += 1
    else break
  }
  return { lastV, run }
}

/**
 * Build a cross-sectional batch: leans toward the taste-ranked pool but
 *   (a) caps the DOMINANT (most-picked) vertical at `maxDominant`, and every
 *       OTHER vertical at a lower `maxOther`, so the batch spreads across MANY
 *       categories instead of two; and
 *   (b) never serves more than `maxRun` of one vertical in a row — counted
 *       CONTINUOUSLY with the recently-served history (`recentVerticals`), so
 *       re-ranks after each pick can't wall up.
 * Diverse cards from `explore` (other verticals, round-robined) fill in. Result:
 * reflects what the user keeps choosing while genuinely spanning verticals.
 */
function buildDiverseBatch(tasteRanked, explore, limit, { maxRun, dominantV, recentVerticals }) {
  const out = []
  const usedIds = new Set()
  // Balance over a SLIDING WINDOW spanning recent history + this batch, so a
  // vertical the user has just seen a lot of gets demoted across re-ranks
  // (not just within one batch). Caps are relative to the window.
  const WINDOW = 12
  const maxDominant = Math.ceil(WINDOW * MAX_DOMINANT_SHARE) // ~5 of 12 (≈40%)
  const maxOther = 2
  const windowSeq = (recentVerticals || []).slice(-(WINDOW - 1))
  let { lastV, run } = tailRunState(recentVerticals)

  const exploreByV = {}
  for (const c of explore) (exploreByV[c.vertical] ||= []).push(c)
  const exploreOrder = shuffle(Object.keys(exploreByV))

  const capFor = (v) => (v === dominantV ? maxDominant : maxOther)
  const windowCount = (v) => {
    const w = windowSeq.slice(-WINDOW)
    let n = 0
    for (const x of w) if (x === v) n += 1
    return n
  }
  const canPlace = (v) => {
    if (v === lastV && run >= maxRun) return false
    if (windowCount(v) >= capFor(v)) return false
    return true
  }
  const place = (card) => {
    out.push(card)
    usedIds.add(String(card.id))
    windowSeq.push(card.vertical)
    if (card.vertical === lastV) run += 1
    else { lastV = card.vertical; run = 1 }
  }
  // Next explore card whose vertical is currently placeable (respects caps+run).
  const nextPlaceableExplore = () => {
    for (const v of exploreOrder) {
      if (!canPlace(v)) continue
      const arr = exploreByV[v]
      while (arr && arr.length) {
        const c = arr.shift()
        if (!usedIds.has(String(c.id))) return c
      }
    }
    return null
  }

  const taste = tasteRanked.slice()
  while (out.length < limit) {
    // 1) Highest-ranked taste card that respects the run + share caps.
    const idx = taste.findIndex((c) => !usedIds.has(String(c.id)) && canPlace(c.vertical))
    if (idx !== -1) { place(taste.splice(idx, 1)[0]); continue }
    // 2) A diverse explore card of a still-placeable vertical.
    const e = nextPlaceableExplore()
    if (e) { place(e); continue }
    // 3) Last resort: everything's capped but the batch isn't full — relax the
    //    caps to avoid returning short, preferring a different vertical.
    const rest = [
      ...taste.filter((c) => !usedIds.has(String(c.id))),
      ...Object.values(exploreByV).flat().filter((c) => !usedIds.has(String(c.id))),
    ]
    if (!rest.length) break
    place(rest.find((c) => c.vertical !== lastV) || rest[0])
  }
  return out
}

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
    presence_type: l.presence_type,
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
  // The verticals of the cards the client has recently SHOWN (most recent last),
  // so the run cap continues across re-ranks instead of resetting each batch.
  const recentVerticals = Array.isArray(body.recentVerticals)
    ? body.recentVerticals.filter((v) => typeof v === 'string').slice(-12)
    : []

  const seen = new Set(seenIds)
  // Picks/skips are always seen even if the client's seenIds lags behind.
  pickedIds.forEach((id) => seen.add(id))
  skippedIds.forEach((id) => seen.add(id))

  const sb = getSupabaseAdmin()

  // ── Exclude the signed-in user's already-saved listings ─────────────
  // The in-memory session sets reset on reload, but a logged-in user's picks
  // persist in user_saves — so without this a saved place reappears on the
  // next visit/refresh. Re-derive the exclusion from user_saves every request.
  let user = null
  try {
    const auth = await createAuthServerClient()
    const res = await auth.auth.getUser()
    user = res?.data?.user || null
    if (user) {
      const { data: saved } = await sb.from('user_saves').select('listing_id').eq('user_id', user.id)
      for (const r of saved || []) seen.add(String(r.listing_id))
    }
  } catch { /* anonymous, or auth unavailable — nothing to exclude */ }

  // ── Durable taste baseline (option a: seed-from-baseline) ───────────
  // A signed-in user with a qualifying persisted profile seeds the feed from
  // their saved/trail history, so the deck reflects their taste from card one —
  // even before the first pick this session. Anonymous / no profile / below the
  // confidence floor → null → the session-only vector below (today's behaviour).
  let baseVector = null
  if (user) {
    const tp = await getTasteProfile(sb, user.id)
    if (tp?.vector) baseVector = tp.vector
  }

  // ── Taste vector (durable baseline blended with this session; cold start
  //     only when neither exists) ────────────────────────────────────────
  const { literal: taste, error: tasteError } = await computeTasteVector(sb, pickedIds, skippedIds, baseVector)
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
      ? await rankedBatch(sb, taste, seen, limit, recentVerticals)
      : await coldStartBatch(sb, seen, limit, lat, lng, recentVerticals)
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
async function rankedBatch(sb, taste, seen, limit, recentVerticals = []) {
  // Deep pool so the dominant vertical has depth AND there are other-vertical
  // candidates to interleave for a genuine cross-section.
  const matchCount = Math.min(MAX_MATCH, limit * 6 + seen.size + 20)
  const { data, error } = await sb.rpc('search_listings_hybrid', {
    query_embedding: taste,
    query_text: null,
    match_count: matchCount,
    similarity_floor: 0.0,
    min_quality: 40,
    include_way: true,
  })
  if (error) throw new Error(error.message)

  const ranked = []
  for (const l of data || []) {
    if (seen.has(String(l.id))) continue
    if (!hasGoodDescription(l)) continue
    ranked.push(trimCard(l))
  }

  // ALWAYS blend in a diverse pool from other verticals (not just as a fallback)
  // so the served feed is a cross-section. The dominant vertical is capped per
  // batch and never runs longer than MAX_RUN — counted across the served history.
  const dominant = modeVertical(ranked)
  const exclude = new Set(seen)
  ranked.forEach((r) => exclude.add(String(r.id)))
  const explore = await explorationPool(sb, dominant, exclude, limit * 2)

  return buildDiverseBatch(ranked, explore, limit, {
    maxRun: MAX_RUN,
    dominantV: dominant,
    recentVerticals,
  })
}

/**
 * A small, vertical-diverse pool from verticals OTHER than the dominant one,
 * used to break up long single-vertical runs in the taste feed. One query,
 * round-robined across verticals for spread.
 */
async function explorationPool(sb, excludeVertical, exclude, limit) {
  const { data, error } = await sb
    .from('listings')
    .select(CARD_FIELDS + ', quality_score')
    .eq('status', 'active')
    .neq('vertical', excludeVertical)
    .gte('quality_score', 40)
    .or('geocode_confidence.is.null,geocode_confidence.neq.low')
    .not('description', 'is', null)
    .order('quality_score', { ascending: false })
    .limit(60)
  if (error) throw new Error(error.message)

  const byV = {}
  for (const l of data || []) {
    const id = String(l.id)
    if (exclude.has(id)) continue
    if (!hasGoodDescription(l)) continue
    ;(byV[l.vertical] ||= []).push(trimCard(l))
  }
  const verts = shuffle(Object.keys(byV))
  const out = []
  let added = true
  while (added && out.length < limit) {
    added = false
    for (const v of verts) {
      const next = byV[v].shift()
      if (next) { out.push(next); added = true; if (out.length >= limit) break }
    }
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
async function coldStartBatch(sb, seen, limit, lat, lng, recentVerticals = []) {
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
  // Shuffle the vertical order so the lead card varies between loads (the feed
  // isn't identical every refresh) while still spanning categories.
  let order = shuffle(verticals.filter((v) => byVertical[v]?.length))
  // Don't lead with a vertical the user has just been shown (continuity with
  // re-ranks / prior loads); rotate it to the back if it's first.
  const { lastV, run } = tailRunState(recentVerticals)
  if (run >= MAX_RUN && order.length > 1 && order[0] === lastV) {
    order = [...order.slice(1), order[0]]
  }
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

  // Shuffle the top-quality rows so the specific venue shown for each vertical
  // varies between loads (all rows are already quality-gated).
  if (bbox) take(shuffle(await fetchVerticalRows(sb, vertical, bbox)))
  if (out.length < n) take(shuffle(await fetchVerticalRows(sb, vertical, null)))
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
