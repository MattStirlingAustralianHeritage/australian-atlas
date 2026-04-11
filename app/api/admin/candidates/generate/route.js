import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { runPipeline } from '@/lib/prospector/pipeline'
import { discoverCandidates, isInAustralia } from '@/lib/prospector/google-places'
import { trigramSimilarity } from '@/lib/prospector/gates'

/**
 * POST /api/admin/candidates/generate
 *
 * Manual trigger for the candidate prospector.
 * Runs the same pipeline as the daily cron, but triggered on demand.
 *
 * Body: { vertical?: string } — optional single vertical filter
 * Auth: admin cookie
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
const TARGET_PER_VERTICAL = 11
const MAX_NEW_PER_VERTICAL = 10

export const maxDuration = 300

export async function POST(request) {
  try {
    const cookieStore = await cookies()
    if (!(await checkAdmin(cookieStore))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({
        error: 'GOOGLE_PLACES_API_KEY not configured',
      }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
  const onlyVertical = body.vertical || null

  const sb = getSupabaseAdmin()
  const startTime = Date.now()
  const results = []
  let totalQueued = 0
  let totalDisqualified = 0
  let totalDiscovered = 0

  // Pre-load master DB for dedup
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
      if (l.website) existingDomains.add(normaliseDomain(l.website))
      if (l.lat && l.lng) existingCoords.push({ lat: l.lat, lng: l.lng })
    }
  }

  const { data: existingCandidates } = await sb
    .from('listing_candidates')
    .select('name, website_url')
    .limit(10000)

  if (existingCandidates) {
    for (const c of existingCandidates) {
      existingNames.add(c.name.toLowerCase().trim())
      if (c.website_url) existingDomains.add(normaliseDomain(c.website_url))
    }
  }

  const verticalsToRun = onlyVertical && VERTICALS[onlyVertical]
    ? [onlyVertical]
    : Object.keys(VERTICALS)

  for (const vertical of verticalsToRun) {
    try {
      // Check current queue depth
      const { count: pendingCount } = await sb
        .from('listing_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('vertical', vertical)

      const currentPending = pendingCount || 0
      const slotsAvailable = Math.max(0, TARGET_PER_VERTICAL - currentPending)
      const maxToQueue = Math.min(slotsAvailable, MAX_NEW_PER_VERTICAL)

      if (maxToQueue === 0) {
        results.push({
          vertical,
          verticalName: VERTICALS[vertical],
          discovered: 0,
          queued: 0,
          disqualified: 0,
          status: 'skipped',
          reason: `Already at ${currentPending}/${TARGET_PER_VERTICAL} pending`,
        })
        continue
      }

      // Get coverage by state
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

      const statesToSearch = STATES
        .map(s => ({ state: s, count: coverage[s] || 0 }))
        .sort((a, b) => a.count - b.count)
        .slice(0, 4)
        .map(s => s.state)

      let verticalQueued = 0
      let verticalDisqualified = 0
      let verticalDiscovered = 0

      for (const state of statesToSearch) {
        if (verticalQueued >= maxToQueue) break

        const rawCandidates = await discoverCandidates(vertical, state, { maxPerSearch: 8 })

        const filtered = []
        for (const candidate of rawCandidates) {
          const nameLower = candidate.name.toLowerCase().trim()
          if (existingNames.has(nameLower)) continue
          let fuzzyDupe = false
          for (const existing of existingNames) {
            if (trigramSimilarity(nameLower, existing) > 0.85) { fuzzyDupe = true; break }
          }
          if (fuzzyDupe) continue
          if (candidate.website_url) {
            const domain = normaliseDomain(candidate.website_url)
            if (domain && existingDomains.has(domain)) continue
          }
          if (candidate.lat && candidate.lng) {
            const tooClose = existingCoords.some(c =>
              haversineMeters(c.lat, c.lng, candidate.lat, candidate.lng) < 100
            )
            if (tooClose) continue
          }
          if (candidate.lat && candidate.lng && !isInAustralia(candidate.lat, candidate.lng)) continue
          if (!candidate.website_url && !WEBSITE_EXEMPT_VERTICALS.includes(vertical)) continue

          filtered.push(candidate)
          existingNames.add(nameLower)
          if (candidate.website_url) existingDomains.add(normaliseDomain(candidate.website_url))
          if (candidate.lat && candidate.lng) existingCoords.push({ lat: candidate.lat, lng: candidate.lng })
        }

        verticalDiscovered += filtered.length

        for (const candidate of filtered) {
          if (verticalQueued >= maxToQueue) break

          try {
            const result = await runPipeline(candidate, sb, { dryRun: false, verbose: false })
            if (result.passed) {
              verticalQueued++
            } else {
              verticalDisqualified++
            }
          } catch (err) {
            console.error(`[generate] Pipeline error for "${candidate.name}":`, err.message)
            verticalDisqualified++
          }

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
        previousPending: currentPending,
        status: 'ok',
      })
    } catch (err) {
      console.error(`[generate] ${vertical} error:`, err.message)
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

  return NextResponse.json({
    success: true,
    source: 'google_places',
    date: new Date().toISOString().split('T')[0],
    duration_seconds: parseFloat(duration),
    total_discovered: totalDiscovered,
    total_queued: totalQueued,
    total_disqualified: totalDisqualified,
    results,
  })
  } catch (err) {
    console.error('[generate] Unhandled error:', err)
    return NextResponse.json({
      error: err.message || 'Internal server error',
      success: false,
    }, { status: 500 })
  }
}

function normaliseDomain(url) {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '').toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
