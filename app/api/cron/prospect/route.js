import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { runPipeline } from '@/lib/prospector/pipeline'
import { discoverCandidates, isInAustralia, STATE_CENTERS } from '@/lib/prospector/google-places'
import { trigramSimilarity } from '@/lib/prospector/gates'

/**
 * GET /api/cron/prospect
 *
 * Daily listing prospector — discovers candidates via Google Places API,
 * deduplicates against the master DB, then runs each through the 5-gate
 * quality verification pipeline.
 *
 * Discovery source: Google Places Text Search API (real, verified businesses only)
 * Pipeline: Dedup -> Gate 0 -> Gate 1 (web) -> Gate 2 (address) -> Gate 3 (activity) -> Gate 4 (vertical fit) -> Score -> Queue
 *
 * Auth: Bearer CRON_SECRET
 *
 * Query params:
 *   ?vertical=sba    — run a single vertical only
 *   ?state=VIC       — target a single state only
 *   ?dry_run=true    — run pipeline in dry-run mode (no DB writes)
 */

const VERTICALS = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']
const WEBSITE_EXEMPT_VERTICALS = ['field']

export const maxDuration = 300 // 5 minutes

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Require Google Places API key
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({
      error: 'GOOGLE_PLACES_API_KEY not configured — prospector cannot run without a verified discovery source',
    }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const onlyVertical = searchParams.get('vertical')
  const onlyState = searchParams.get('state')?.toUpperCase()
  const dryRun = searchParams.get('dry_run') === 'true'

  const sb = getSupabaseAdmin()
  const startTime = Date.now()
  const results = []
  let totalQueued = 0
  let totalDisqualified = 0
  let totalDiscovered = 0

  // ── Pre-load master DB for dedup ────────────────────────
  const existingNames = new Set()
  const existingDomains = new Set()
  const existingCoords = []

  const { data: existingListings } = await sb
    .from('listings')
    .select('name, website, lat, lng')
    .eq('status', 'active')
    .limit(20000)

  if (existingListings) {
    for (const l of existingListings) {
      existingNames.add(l.name.toLowerCase().trim())
      if (l.website) {
        existingDomains.add(normaliseDomain(l.website))
      }
      if (l.lat && l.lng) {
        existingCoords.push({ lat: l.lat, lng: l.lng })
      }
    }
  }

  // Also check pending candidates
  const { data: existingCandidates } = await sb
    .from('listing_candidates')
    .select('name, website_url')
    .in('status', ['pending', 'reviewing'])

  if (existingCandidates) {
    for (const c of existingCandidates) {
      existingNames.add(c.name.toLowerCase().trim())
      if (c.website_url) existingDomains.add(normaliseDomain(c.website_url))
    }
  }

  // ── Determine which verticals and states to run ─────────

  const verticalsToRun = onlyVertical && VERTICALS[onlyVertical]
    ? [onlyVertical]
    : Object.keys(VERTICALS)

  for (const vertical of verticalsToRun) {
    try {
      // Get coverage by state to identify thin states
      const coverage = {}
      for (const s of STATES) {
        const { count } = await sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('vertical', vertical)
          .eq('state', s)
        coverage[s] = count || 0
      }

      // Target thin states (fewest listings) — or specific state if requested
      const statesToSearch = onlyState
        ? [onlyState]
        : STATES
            .map(s => ({ state: s, count: coverage[s] || 0 }))
            .sort((a, b) => a.count - b.count)
            .slice(0, 4) // Focus on 4 thinnest states
            .map(s => s.state)

      let verticalQueued = 0
      let verticalDisqualified = 0
      let verticalDiscovered = 0

      for (const state of statesToSearch) {
        // ── Discover candidates via Google Places ──────
        console.log(`[prospect] Discovering ${vertical} candidates in ${state}...`)
        const rawCandidates = await discoverCandidates(vertical, state, {
          maxPerSearch: 8,
        })

        // ── Pre-filter: dedup against master DB ───────
        const filtered = []
        for (const candidate of rawCandidates) {
          const nameLower = candidate.name.toLowerCase().trim()

          // 1. Exact name match
          if (existingNames.has(nameLower)) continue

          // 2. Fuzzy name match (>85%)
          let fuzzyDupe = false
          for (const existing of existingNames) {
            if (trigramSimilarity(nameLower, existing) > 0.85) {
              fuzzyDupe = true
              break
            }
          }
          if (fuzzyDupe) continue

          // 3. Website domain match
          if (candidate.website_url) {
            const domain = normaliseDomain(candidate.website_url)
            if (domain && existingDomains.has(domain)) continue
          }

          // 4. Coordinate proximity (within 100m = same place)
          if (candidate.lat && candidate.lng) {
            const tooClose = existingCoords.some(c =>
              haversineMeters(c.lat, c.lng, candidate.lat, candidate.lng) < 100
            )
            if (tooClose) continue
          }

          // 5. Hard geographic filter — Australia only
          if (candidate.lat && candidate.lng && !isInAustralia(candidate.lat, candidate.lng)) continue

          // 6. Website requirement (non-exempt verticals)
          if (!candidate.website_url && !WEBSITE_EXEMPT_VERTICALS.includes(vertical)) continue

          filtered.push(candidate)
          existingNames.add(nameLower) // Prevent intra-batch dupes
          if (candidate.website_url) existingDomains.add(normaliseDomain(candidate.website_url))
          if (candidate.lat && candidate.lng) existingCoords.push({ lat: candidate.lat, lng: candidate.lng })
        }

        verticalDiscovered += filtered.length
        console.log(`[prospect] ${vertical}/${state}: ${rawCandidates.length} found, ${filtered.length} after dedup`)

        // ── Run each through the quality gate pipeline ─
        for (const candidate of filtered) {
          try {
            const result = await runPipeline(candidate, sb, { dryRun, verbose: false })

            if (result.passed) {
              verticalQueued++
              console.log(`[prospect] QUEUED: "${candidate.name}" (${state}) — score ${result.score}`)
            } else {
              verticalDisqualified++
              console.log(`[prospect] DROPPED: "${candidate.name}" — Gate ${result.failedGate}: ${result.failReason}`)
            }
          } catch (err) {
            console.error(`[prospect] Pipeline error for "${candidate.name}":`, err.message)
            verticalDisqualified++
          }

          // Rate limit between pipeline runs
          await new Promise(r => setTimeout(r, 800))
        }
      }

      totalQueued += verticalQueued
      totalDisqualified += verticalDisqualified
      totalDiscovered += verticalDiscovered

      results.push({
        vertical,
        verticalName: VERTICALS[vertical],
        statesSearched: statesToSearch,
        discovered: verticalDiscovered,
        queued: verticalQueued,
        disqualified: verticalDisqualified,
        status: 'ok',
      })

    } catch (err) {
      console.error(`[prospect] ${vertical} error:`, err.message)
      results.push({
        vertical,
        verticalName: VERTICALS[vertical],
        discovered: 0,
        queued: 0,
        disqualified: 0,
        status: 'error',
        error: err.message,
      })
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`[prospect] Done in ${duration}s — ${totalDiscovered} discovered, ${totalQueued} queued, ${totalDisqualified} disqualified`)

  return NextResponse.json({
    success: true,
    source: 'google_places',
    date: new Date().toISOString().split('T')[0],
    duration_seconds: parseFloat(duration),
    total_discovered: totalDiscovered,
    total_queued: totalQueued,
    total_disqualified: totalDisqualified,
    dry_run: dryRun,
    results,
  })
}

// ─── Helpers ────────────────────────────────────────────────

function normaliseDomain(url) {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '')
      .toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000 // meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
