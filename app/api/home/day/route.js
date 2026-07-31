import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { resolveRegionParam } from '@/lib/regions'
import { assembleRegionDay, assembleDayNearPoint, fetchDrivingGeometry } from '@/lib/home/dayBuilder'

// ─────────────────────────────────────────────────────────────────
// The typed day: ?q=Fremantle → a worked day anchored on that place,
// same gates and route-threading the homepage's hourly day uses.
// Resolution order:
//   1. The regions table (name/slug/alias via resolveRegionParam) —
//      "Mornington Peninsula", "yarra-valley".
//   2. Mapbox forward geocode, Australia only, place-scale types —
//      "Fremantle", "Bright", "Mornington". The day is then assembled
//      from listings around that point, anchored ON the point so a
//      "day in Fremantle" doesn't drift into central Perth.
// The seed is the current hour, so a repeated query inside the hour
// deals the same day and the CDN cache below does the heavy lifting.
// ─────────────────────────────────────────────────────────────────

// Simple in-memory rate limiter, same shape as /api/nearby: each
// typed query can cost a geocode + a Directions call.
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

// Forward geocode a typed place to CANDIDATE points. Australia-locked,
// place-scale types only — no POIs, no addresses, no bare country (the
// word "Australia" alone famously resolves to a paddock in SA). Several
// candidates, exact name matches first: Mapbox's own first pick for
// "Mornington" is Mornington Island in the Gulf of Carpentaria, while
// the town the reader meant sits at #2 — the day-build attempt loop
// below sorts that out by trying each until one has listings around it.
async function geocodePlaceCandidates(q) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
  if (!token) return []
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?country=au&types=place,locality,district,region&limit=5&access_token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = await res.json()
    const features = (data.features || []).filter(f => Array.isArray(f.center))
    const exact = (f) => String(f.text || '').toLowerCase() === q.toLowerCase()
    return features
      .sort((a, b) => Number(exact(b)) - Number(exact(a)))
      .slice(0, 4)
      .map(f => ({ lat: f.center[1], lng: f.center[0], label: f.text || q }))
  } catch {
    return []
  }
}

export async function GET(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': '60' },
    })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 60)
  if (q.length < 2) {
    return NextResponse.json({ error: 'q required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const hourSeed = Math.floor(Date.now() / (60 * 60 * 1000))

  let day = null
  try {
    const { region: resolved } = await resolveRegionParam(q)
    if (resolved) {
      day = await assembleRegionDay(sb, resolved.name, hourSeed)
    } else {
      // Try each geocode candidate until one has enough of an atlas
      // around it to fill a day — homonym towns and remote islands
      // fall through to the reader's likely intent.
      for (const point of await geocodePlaceCandidates(q)) {
        day = await assembleDayNearPoint(sb, point, hourSeed)
        if (day) break
      }
    }
    if (day) {
      day = {
        ...day,
        routeGeometry: await fetchDrivingGeometry(
          day.stops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
        ),
      }
    }
  } catch {
    day = null
  }

  // `day: null` is a legitimate answer (nowhere near enough listings),
  // not an error — the client renders it as a gentle empty state. Both
  // outcomes cache for the hour: the seed only turns hourly anyway.
  return NextResponse.json({ day }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
