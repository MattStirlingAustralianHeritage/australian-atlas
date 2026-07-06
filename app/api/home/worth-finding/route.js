import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getTasteProfile } from '@/lib/discover/getTasteProfile'
import { buildTasteProfileFromListingIds, mergeTasteProfiles, tasteAffinity } from '@/lib/discover/tasteProfile'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'

// ============================================================
// GET /api/home/worth-finding — the signed-in, location-shared variant of the
// homepage "Worth Finding This Week" band.
//
// Contract with the client (WorthFindingSection): only called when the visitor
// is signed in AND LocationProvider already holds a shared location. Returns
// up to four picks (lead + rail) drawn EXCLUSIVELY from within 100 km of the
// caller, ranked by their taste profile (persisted Discover contributions,
// merged with any same-session onboarding picks) plus the same editorial
// signals the weekly selection leans on. Fewer than two viable picks → an
// empty list, and the client keeps the cached editorial band.
//
// Per-user by definition — never cached (private, no-store). force-dynamic
// keeps the build's static probe away from the auth cookie read — without it
// the catch block below swallows the probe's DynamicServerError and the route
// risks being baked as a static empty response.
// ============================================================

export const dynamic = 'force-dynamic'

const RADIUS_KM = 100
// Taste dominates when present (tasteAffinity is 0–1); editorial signals and
// proximity break ties. Same additive-bonus philosophy as the planners.
const TASTE_WEIGHT = 2.5

const AU_BOUNDS = { latMin: -44, latMax: -10, lngMin: 112, lngMax: 154 }

// The picks rotate daily: the top of the taste-ranked pool is reshuffled with
// a day-resolution seed (same LCG as the homepage's weekly editorial shuffle),
// so a returning visitor sees a fresh local four every 24 hours without the
// selection ever leaving the quality pool.
const ROTATION_POOL_SIZE = 24

function getDailySeed() {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000))
}

function seededShuffle(arr, seed) {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length
const strongDescription = (l) => wordCount(l.description) >= 15

export async function GET(request) {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat'))
    const lng = parseFloat(searchParams.get('lng'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < AU_BOUNDS.latMin || lat > AU_BOUNDS.latMax ||
        lng < AU_BOUNDS.lngMin || lng > AU_BOUNDS.lngMax) {
      return NextResponse.json({ error: 'lat and lng within Australia are required' }, { status: 400 })
    }
    const locale = searchParams.get('locale') || 'en'
    const picks = (searchParams.get('picks') || '')
      .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)

    const sb = getSupabaseAdmin()

    // Candidates: true nearest venues within the hard 100 km radius, with the
    // privacy / visitability / needs_review guards applied in SQL (mig 166).
    const { data: rpcData, error: rpcError } = await sb.rpc('nearby_listings', {
      center_lat: lat,
      center_lng: lng,
      radius_km: RADIUS_KM,
      filter_vertical: null,
      max_results: 400,
    })
    if (rpcError) {
      console.error('[worth-finding] nearby_listings RPC failed:', rpcError.message)
      return NextResponse.json({ listings: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const candidates = (rpcData || []).filter(
      (l) => isPublicListing(l) && l.slug && !String(l.name || '').startsWith('_')
    )
    if (candidates.length < 2) {
      return NextResponse.json({ listings: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    // Taste: the persisted profile (saves + owned trail stops, confidence
    // floor of 3) merged with any picks the visitor just made in the
    // Discover onboarding deck — both count as Discover contributions.
    const [durable, session] = await Promise.all([
      getTasteProfile(sb, user.id),
      picks.length > 0 ? buildTasteProfileFromListingIds(sb, picks) : Promise.resolve(null),
    ])
    const profile = mergeTasteProfiles(durable?.shares || null, session)

    const score = (l) => {
      let s = tasteAffinity(profile, l) * TASTE_WEIGHT
      if (profile && l.region) s += 0.5 * (profile.regionWeights?.[l.region] || 0)
      if (l.is_featured) s += 1
      if (l.editors_pick) s += 0.6
      if (l.is_claimed) s += 0.3
      if (l.hero_image_url) s += 0.4
      if (strongDescription(l)) s += 0.4
      s += (1 - Math.min(l.distance_km || 0, RADIUS_KM) / RADIUS_KM) * 0.8
      return s
    }
    const ranked = [...candidates].sort((a, b) => score(b) - score(a))

    // Daily rotation: shuffle the top of the ranked pool with today's seed,
    // then select from the shuffled order. A concentrated taste profile can
    // fill the whole top slice with one vertical (e.g. all breweries), which
    // would starve the rail's one-per-vertical rule — so every vertical's
    // best candidate is guaranteed a seat in the pool.
    const pool = ranked.slice(0, ROTATION_POOL_SIZE)
    const pooledVerticals = new Set(pool.map((l) => l.vertical))
    for (const l of ranked) {
      if (!pooledVerticals.has(l.vertical)) {
        pool.push(l)
        pooledVerticals.add(l.vertical)
      }
    }
    const rotated = seededShuffle(pool, getDailySeed())

    // Lead: a venue that can carry the cover — photo + a real standfirst if
    // the pool has one, then description-only, then anything. Cover-worthy
    // venues are scarce in most pools, so "first qualifying in shuffled
    // order" barely moves day to day — index by day instead, cycling the
    // cover through every qualifying venue.
    const leadPool =
      ((p) => (p.length ? p : null))(rotated.filter((l) => l.hero_image_url && strongDescription(l))) ||
      ((p) => (p.length ? p : null))(rotated.filter(strongDescription)) ||
      rotated
    const lead = leadPool[getDailySeed() % leadPool.length]

    // Rail: next in rotated order, one per vertical for variety, topped up to
    // three (falling back to the full ranked list when the pool runs short).
    const rail = []
    const usedVerticals = new Set([lead.vertical])
    for (const l of rotated) {
      if (l.id === lead.id || rail.length >= 3) continue
      if (!usedVerticals.has(l.vertical)) {
        rail.push(l)
        usedVerticals.add(l.vertical)
      }
    }
    if (rail.length < 3) {
      const have = new Set([lead.id, ...rail.map((r) => r.id)])
      for (const l of [...rotated, ...ranked]) {
        if (rail.length >= 3) break
        if (!have.has(l.id)) { rail.push(l); have.add(l.id) }
      }
    }

    let listings = [lead, ...rail].map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description,
      hero_image_url: l.hero_image_url,
      vertical: l.vertical,
      sub_type: l.sub_type,
      region: l.region,
      distance_km: l.distance_km != null ? Math.round(l.distance_km * 10) / 10 : null,
    }))
    listings = await overlayListingTranslations(listings, locale, sb)

    return NextResponse.json(
      { listings, radius_used: RADIUS_KM, tasteApplied: !!profile },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[worth-finding] Error:', err?.message)
    return NextResponse.json({ listings: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
