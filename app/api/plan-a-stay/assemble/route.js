import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateTripTitle } from '@/lib/plan-a-stay/title-generation'
import { computeCentroid } from '@/lib/plan-a-stay/day-theme'
import { generateTripDisclosures } from '@/lib/plan-a-stay/disclosures'
import { buildDays, isActivityListing } from '@/lib/plan-a-stay/assemble-days'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — Assembly endpoint
   ═══════════════════════════════════════════════════════════════════════
   Takes the conversation answers + retrieval output and produces a fully
   assembled trip. Each day is laid out by lib/plan-a-stay/assemble-days as:
   coffee first, lunch in the middle, up to three activities, and a set of
   accommodation options the visitor picks from at the bottom of the day.  */


/* ─── Mapbox static map URL builder ─────────────────────────────────── */
// Clean, legible base map. The previous custom style
// (mattstirlingaustralianheritage/cmn32b0iz…) renders the static API as a
// near-empty dark canvas — no roads, towns, or terrain — so the day maps read
// as black boxes. light-v11 is the same style the region detail pages use.
const MAPBOX_STYLE = 'mapbox/light-v11'

function buildStaticMapUrl(stops, width = 720, height = 300) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !stops || stops.length === 0) return null

  // Numbered amber pins, in itinerary order.
  const markers = stops.map((stop, i) =>
    `pin-s-${i + 1}+C4973B(${stop.lng},${stop.lat})`
  ).join(',')

  // Single stop — centre on it at a sensible neighbourhood zoom.
  if (stops.length === 1) {
    const s = stops[0]
    return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/${s.lng},${s.lat},12,0/${width}x${height}@2x?access_token=${token}&padding=48`
  }

  // Auto-fit all pins with generous padding so none sit on the edge.
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/auto/${width}x${height}@2x?access_token=${token}&padding=56`
}


/* ─── Fetch listing descriptions + display-safe hero images ──────────
   Images pass the same two gates every public card uses: approved host
   allowlist + the moderation veto. Anything else renders imageless.    */
async function fetchListingAssets(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  const assetMap = new Map()
  if (unique.length === 0) return assetMap

  const sb = getSupabaseAdmin()
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data } = await sb
      .from('listings')
      .select('id, description, hero_image_url, image_moderation_status')
      .in('id', chunk)
    for (const row of data || []) {
      const imageOk = isApprovedImageSource(row.hero_image_url) && isHeroDisplayable(row)
      assetMap.set(row.id, {
        description: row.description || '',
        image_url: imageOk ? row.hero_image_url : null,
      })
    }
  }
  return assetMap
}


/* ─── Stays-only copy (regions with somewhere to stay but nothing else) ── */
function staysOnlyFraming(answers) {
  const region = answers.region || 'this region'
  return `${region} has good independent places to stay, but not enough else listed yet for a full trip. Rather than build a day-by-day plan that isn't really there, here are the stays worth knowing about.`
}

function staysOnlyRedirect(answers) {
  const region = answers.region || 'this region'
  return `Try a different kind of trip in ${region}, or look for a quiet-and-slow trip in a region with more range.`
}

function staysOnlyResponse(restPool, answers) {
  const stays = (restPool || [])
    .slice(0, 6)
    .map(s => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      sub_type: s.sub_type || null,
      suburb: s.suburb || null,
    }))
  return NextResponse.json({
    trip: null,
    stays_only: {
      region: answers.region,
      intent: answers.intent,
      framing: staysOnlyFraming(answers),
      redirect: staysOnlyRedirect(answers),
      stays,
    },
  }, { status: 200 })
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
    const pools = retrieval.pools || { coffee: [], lunch: [], rest: [] }
    const coffeePool = pools.coffee || []
    const lunchPool = pools.lunch || []
    const restPool = pools.rest || []

    const allCandidates = clusters.flatMap(c => c.candidates || [])
    const activityCandidates = allCandidates.filter(isActivityListing)

    // ── Empty: nothing listed anywhere for this region/intent ─────────
    if (
      allCandidates.length === 0 &&
      coffeePool.length === 0 &&
      lunchPool.length === 0 &&
      restPool.length === 0
    ) {
      return NextResponse.json({
        trip: null,
        empty_state: {
          reason: 'no_candidates',
          message: "We couldn't build a trip from these inputs. Try a different region or broader intent.",
          answers,
        },
      }, { status: 200 })
    }

    // ── Stays-only: nowhere to go or eat, but somewhere to stay ───────
    if (
      activityCandidates.length === 0 &&
      coffeePool.length === 0 &&
      lunchPool.length === 0 &&
      restPool.length > 0
    ) {
      return staysOnlyResponse(restPool, answers)
    }

    // ── Descriptions + images (activities, meal anchors, stays) ───────
    const descMap = await fetchListingAssets([
      ...allCandidates.map(c => c.id),
      ...coffeePool.map(c => c.id),
      ...lunchPool.map(c => c.id),
      ...restPool.map(c => c.id),
    ])

    // ── Trip centre from cluster candidates (for directional headings) ─
    const allStops = clusters.flatMap(c => (c.candidates || []).slice(0, 5))
    const tripCenter = allStops.length > 0 ? computeCentroid(allStops) : null

    // ── Build the days ────────────────────────────────────────────────
    const days = buildDays({
      clusters,
      pools,
      answers,
      descMap,
      tripCenter,
      buildMapUrl: buildStaticMapUrl,
    })

    // No geographic spine to hang a trip on — fall back to stays / empty.
    if (days.length === 0) {
      if (restPool.length > 0) return staysOnlyResponse(restPool, answers)
      return NextResponse.json({
        trip: null,
        empty_state: {
          reason: 'no_clusters',
          message: "We couldn't build a trip from these inputs. Try a different region or broader intent.",
          answers,
        },
      }, { status: 200 })
    }

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

    return NextResponse.json({ trip })
  } catch (err) {
    console.error('[plan-a-stay/assemble]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
