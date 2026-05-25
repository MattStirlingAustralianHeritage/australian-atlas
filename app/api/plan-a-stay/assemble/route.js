import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateTripTitle } from '@/lib/plan-a-stay/title-generation'
import {
  generateDayHeading,
  generateDayTheme,
  computeLoopKm,
  computeCentroid,
} from '@/lib/plan-a-stay/day-theme'
import {
  generateTripDisclosures,
  generateDayDisclosures,
} from '@/lib/plan-a-stay/disclosures'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — Assembly endpoint
   ═══════════════════════════════════════════════════════════════════════
   Takes the conversation answers + retrieval output, produces a
   fully assembled trip with editorial title, day themes, disclosures,
   static maps, and persists the result.                                */


/* ─── Slugify helper ────────────────────────────────────────────────── */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function generateShareSlug(title) {
  const base = slugify(title)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}


/* ─── Mapbox static map URL builder ─────────────────────────────────── */
const MAPBOX_STYLE = 'mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'

function buildStaticMapUrl(stops, width = 720, height = 300) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !stops || stops.length === 0) return null

  // Build numbered markers
  const markers = stops.map((stop, i) => {
    const label = i + 1
    // Use pin-s (small) with amber colour
    return `pin-s-${label}+C4973B(${stop.lng},${stop.lat})`
  }).join(',')

  // Auto-fit bounding box
  if (stops.length === 1) {
    const s = stops[0]
    return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/${s.lng},${s.lat},13,0/${width}x${height}@2x?access_token=${token}&padding=40`
  }

  // Use auto-fit with padding
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/auto/${width}x${height}@2x?access_token=${token}&padding=40`
}


/* ─── Description excerpt helper ────────────────────────────────────── */
function excerptDescription(desc, maxLen = 140) {
  if (!desc) return ''
  if (desc.length <= maxLen) return desc
  // Cut at last word boundary before maxLen
  const cut = desc.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…'
}


/* ─── Fetch full listing descriptions for stops ─────────────────────── */
async function enrichStopsWithDescriptions(clusters) {
  const sb = getSupabaseAdmin()
  const allIds = clusters.flatMap(c => (c.candidates || []).map(s => s.id))
  if (allIds.length === 0) return new Map()

  const { data } = await sb
    .from('listings')
    .select('id, description')
    .in('id', allIds)

  const descMap = new Map()
  for (const row of data || []) {
    descMap.set(row.id, row.description || '')
  }
  return descMap
}


/* ═══════════════════════════════════════════════════════════════════════
   POST handler
   ═══════════════════════════════════════════════════════════════════════ */
export async function POST(request) {
  try {
    const body = await request.json()
    const { answers, retrieval } = body

    if (!answers || !retrieval) {
      return NextResponse.json(
        { error: 'Missing answers or retrieval in request body' },
        { status: 400 }
      )
    }

    const clusters = retrieval.clusters || []
    const coverage = retrieval.coverage || {}

    // ── Generate title ────────────────────────────────────────────────
    const title = await generateTripTitle(answers, retrieval)

    // ── Fetch descriptions for excerpt generation ─────────────────────
    const descMap = await enrichStopsWithDescriptions(clusters)

    // ── Compute trip centre from all cluster centroids ────────────────
    const allStops = clusters.flatMap(c => (c.candidates || []).slice(0, 5))
    const tripCenter = allStops.length > 0
      ? computeCentroid(allStops)
      : null

    // ── Build days from clusters ──────────────────────────────────────
    const days = []
    let prevDay = null

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      // Take top candidates as stops (up to 5, usually 3–5)
      const candidates = (cluster.candidates || []).slice(0, 5)

      const stops = candidates.map(c => ({
        listing_id: c.id,
        name: c.name,
        vertical: c.vertical,
        sub_type: c.sub_type || null,
        lat: c.lat,
        lng: c.lng,
        description_excerpt: excerptDescription(descMap.get(c.id) || ''),
      }))

      const centroid = computeCentroid(stops)
      const loopKm = computeLoopKm(stops)
      const heading = generateDayHeading(stops, i, tripCenter)
      const theme = generateDayTheme(stops)

      const day = {
        day_number: i + 1,
        heading,
        theme,
        stops,
        day_disclosures: [],
        centroid,
        loop_km: loopKm,
        map_url: buildStaticMapUrl(stops),
      }

      // Day disclosures need the previous day for comparison
      day.day_disclosures = generateDayDisclosures(day, prevDay)

      days.push(day)
      prevDay = day
    }

    // ── Trip-level disclosures ────────────────────────────────────────
    const tripDisclosures = generateTripDisclosures(coverage, answers)

    // ── Intro line ────────────────────────────────────────────────────
    const totalStops = days.reduce((sum, d) => sum + d.stops.length, 0)
    const dayWord = days.length === 1 ? 'day' : 'days'
    const stopWord = totalStops === 1 ? 'stop' : 'stops'
    const intro = `${days.length} ${dayWord}, ${totalStops} ${stopWord}, anchored around ${answers.region || 'the region'}.`

    // ── Assemble trip object ──────────────────────────────────────────
    const trip = {
      title,
      intro,
      trip_disclosures: tripDisclosures,
      days,
    }

    // ── Generate share slug ───────────────────────────────────────────
    const shareSlug = generateShareSlug(title)

    // ── Persist to plan_a_stay_trips ──────────────────────────────────
    let tripId = null
    try {
      const sb = getSupabaseAdmin()
      const { data: inserted, error: insertError } = await sb
        .from('plan_a_stay_trips')
        .insert({
          share_slug: shareSlug,
          answers,
          retrieval,
          trip,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[plan-a-stay/assemble] Failed to persist trip:', insertError.message)
      } else {
        tripId = inserted.id
      }
    } catch (err) {
      console.error('[plan-a-stay/assemble] Trip persistence error:', err.message)
    }

    return NextResponse.json({
      trip,
      trip_id: tripId,
      share_slug: shareSlug,
    })
  } catch (err) {
    console.error('[plan-a-stay/assemble]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
