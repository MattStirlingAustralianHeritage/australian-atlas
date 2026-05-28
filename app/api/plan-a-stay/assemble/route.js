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
function excerptDescription(desc, maxLen = 200) {
  if (!desc) return ''
  if (desc.length <= maxLen) return desc

  const slice = desc.slice(0, maxLen)

  // Prefer cutting at a sentence boundary (". " or "! " or "? ")
  const sentenceBreak = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  )
  if (sentenceBreak > maxLen * 0.5) {
    return slice.slice(0, sentenceBreak + 1)
  }

  // Fall back to word boundary
  const wordBreak = slice.lastIndexOf(' ')
  if (wordBreak > 0) {
    return slice.slice(0, wordBreak) + '…'
  }

  return slice + '…'
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


/* ─── Per-day diversity constraint ──────────────────────────────────── */
const MAX_REST_PER_DAY = 1

const SUBTYPE_CAPS = {
  // SBA — cap at 3 to avoid winery walls
  winery: 3, brewery: 3, distillery: 3, cidery: 3,
  // Table
  restaurant: 3, farm_gate: 3, market: 3, bakery: 3,
  // Rest — already capped by MAX_REST_PER_DAY, but belt-and-braces
  boutique_hotel: 1, cottage: 1, glamping: 1, farm_stay: 1,
  // Craft / Collection — 2 keeps variety
  craft: 2, collection: 2,
}
const DEFAULT_SUBTYPE_CAP = 3

function pickDayStops(rankedCandidates, targetCount = 4) {
  const picked = []
  let restCount = 0
  const subtypeCounts = {}

  for (const candidate of rankedCandidates) {
    if (picked.length >= targetCount) break

    // Rest cap (vertical-level)
    if (candidate.vertical === 'rest') {
      if (restCount >= MAX_REST_PER_DAY) continue
      restCount++
    }

    // Sub-type saturation cap
    const st = candidate.sub_type
    if (st) {
      const cap = SUBTYPE_CAPS[st] ?? DEFAULT_SUBTYPE_CAP
      const count = subtypeCounts[st] || 0
      if (count >= cap) continue
      subtypeCounts[st] = count + 1
    }

    picked.push(candidate)
  }
  return picked
}


/* ─── Sort Rest stops to end of day sequence ───────────────────────── */
function sortRestLast(stops) {
  return stops.slice().sort((a, b) => {
    const aRest = a.vertical === 'rest' ? 1 : 0
    const bRest = b.vertical === 'rest' ? 1 : 0
    return aRest - bRest
  })
}


/* ─── Fold single-Rest-only days into the previous day ─────────────── */
function foldSingleRestDays(days, tripCenter, pacing) {
  if (days.length < 2) return days

  const folded = []
  for (const day of days) {
    const isRestOnly =
      day.stops.length > 0 && day.stops.every(s => s.vertical === 'rest')

    if (isRestOnly && folded.length > 0) {
      // Merge rest stop(s) into the previous day
      const prev = folded[folded.length - 1]
      prev.stops = sortRestLast([...prev.stops, ...day.stops])
      prev.centroid = computeCentroid(prev.stops)
      prev.loop_km = computeLoopKm(prev.stops)
      prev.theme = generateDayTheme(prev.stops)
      prev.map_url = buildStaticMapUrl(prev.stops)
    } else {
      folded.push(day)
    }
  }

  // Regenerate numbering, headings, and disclosures if structure changed
  if (folded.length < days.length) {
    let prev = null
    folded.forEach((d, i) => {
      d.day_number = i + 1
      d.heading = generateDayHeading(d.stops, i, tripCenter, pacing)
      d.day_disclosures = generateDayDisclosures(d, prev)
      prev = d
    })
  }

  return folded
}


/* ─── Stays-only copy (all-Rest regions) ───────────────────────────── */
function staysOnlyFraming(answers) {
  const region = answers.region || 'this region'
  return `${region} has good independent places to stay, but not enough else listed yet for a full trip. Rather than build a day-by-day plan that isn't really there, here are the stays worth knowing about.`
}

function staysOnlyRedirect(answers) {
  const region = answers.region || 'this region'
  return `Try a different kind of trip in ${region}, or look for a quiet-and-slow trip in a region with more range.`
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

    // ── Zero-candidate guard ─────────────────────────────────────────
    const totalCandidates = clusters.reduce(
      (sum, c) => sum + (c.candidates?.length || 0), 0
    )

    if (totalCandidates === 0) {
      return NextResponse.json({
        trip: null,
        empty_state: {
          reason: 'no_candidates',
          message: "We couldn't build a trip from these inputs. Try a different region or broader intent.",
          answers,
        },
      }, { status: 200 })
    }

    // ── All-Rest detection ───────────────────────────────────────────
    // Region has accommodation but nothing curated to do for this intent.
    // Return a stays-only response rather than a hollow itinerary.
    const allCandidates = clusters.flatMap(cl => cl.candidates || [])
    const allRest = allCandidates.length > 0 &&
      allCandidates.every(c => c.vertical === 'rest')

    if (allRest) {
      const stays = allCandidates
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 6)

      return NextResponse.json({
        trip: null,
        stays_only: {
          region: answers.region,
          intent: answers.intent,
          framing: staysOnlyFraming(answers),
          redirect: staysOnlyRedirect(answers),
          stays: stays.map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            sub_type: s.sub_type || null,
            suburb: s.suburb || null,
          })),
        },
      }, { status: 200 })
    }

    // ── Fetch descriptions for excerpt generation ─────────────────────
    const descMap = await enrichStopsWithDescriptions(clusters)

    // ── Compute trip centre from all cluster centroids ────────────────
    const allStops = clusters.flatMap(c => (c.candidates || []).slice(0, 5))
    const tripCenter = allStops.length > 0
      ? computeCentroid(allStops)
      : null

    // ── Build days from clusters ──────────────────────────────────────
    let days = []
    let prevDay = null

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      // Apply diversity constraint: max 1 Rest per day
      const candidates = pickDayStops(cluster.candidates || [], 5)
      const lowDiversity = candidates.length < 2

      const unsortedStops = candidates.map(c => ({
        listing_id: c.id,
        name: c.name,
        vertical: c.vertical,
        sub_type: c.sub_type || null,
        lat: c.lat,
        lng: c.lng,
        suburb: c.suburb || null,
        description_excerpt: excerptDescription(descMap.get(c.id) || ''),
      }))
      const stops = sortRestLast(unsortedStops)

      const centroid = computeCentroid(stops)
      const loopKm = computeLoopKm(stops)
      const heading = generateDayHeading(stops, i, tripCenter, answers.pacing || null)
      const theme = generateDayTheme(stops)

      const day = {
        day_number: i + 1,
        heading,
        theme,
        stops,
        low_diversity: lowDiversity,
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

    // ── Fold single-Rest-only days into previous day ───────────────────
    days = foldSingleRestDays(days, tripCenter, answers.pacing || null)

    // ── Trip-level disclosures ────────────────────────────────────────
    const tripDisclosures = generateTripDisclosures(coverage, answers, { day_count: days.length })

    // ── Intro line ────────────────────────────────────────────────────
    const totalStops = days.reduce((sum, d) => sum + d.stops.length, 0)
    const dayWord = days.length === 1 ? 'day' : 'days'
    const stopWord = totalStops === 1 ? 'stop' : 'stops'
    const intro = `${days.length} ${dayWord}, ${totalStops} ${stopWord}, anchored around ${answers.region || 'the region'}.`

    // ── Build assembled summary for title generation ──────────────────
    const assembled = {
      day_count: days.length,
      total_stops: totalStops,
      region: answers.region || 'the region',
      days: days.map(d => ({
        day_number: d.day_number,
        heading: d.heading,
        theme: d.theme,
        stop_summary: d.stops.map(s => `${s.name} (${s.vertical})`),
        stop_types: d.stops.map(s => ({ vertical: s.vertical, sub_type: s.sub_type })),
      })),
      disclosures: tripDisclosures,
    }

    // ── Generate title from assembled trip ────────────────────────────
    const title = await generateTripTitle({ answers, assembled })

    // ── Assemble trip object ──────────────────────────────────────────
    const trip = {
      title,
      intro,
      trip_disclosures: tripDisclosures,
      days,
    }

    return NextResponse.json({
      trip,
    })
  } catch (err) {
    console.error('[plan-a-stay/assemble]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
