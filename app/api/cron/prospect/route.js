import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { replenishVertical, buildDedupSets, AUTO_VERTICALS, VERTICAL_NAMES } from '@/lib/prospector/replenish'
import { probePlacesQuota } from '@/lib/prospector/google-places'

/**
 * GET /api/cron/prospect
 *
 * Daily listing prospector — discovers candidates via Google Places, dedups
 * against the master DB, then runs each through the 5-gate quality pipeline.
 * Builds queue backlog toward TARGET_PER_VERTICAL. The floor guarantee
 * (≥10 per vertical each morning) is enforced separately by
 * /api/cron/ensure-candidates, which runs just after this.
 *
 * Discovery now sweeps rotating regional towns first (fresh geography) then the
 * capital centres — see lib/prospector/replenish.js. This is the shared core
 * used by the floor cron and the admin "Generate" button too.
 *
 * Auth: Bearer CRON_SECRET
 * Query: ?vertical=sba (single vertical), ?dry_run=true
 */

const TARGET_PER_VERTICAL = 100
const MAX_NEW_PER_VERTICAL = 12

export const maxDuration = 300 // 5 minutes

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const onlyVertical = searchParams.get('vertical')
  const dryRun = searchParams.get('dry_run') === 'true'

  const sb = getSupabaseAdmin()
  const startTime = Date.now()
  const deadlineMs = startTime + 270000

  // OSM Overpass is the primary, quota-free supply; Google Places is an optional
  // top-up only when its quota is healthy. Probe once so a dead quota is skipped
  // (not burned) and reported rather than silently starving the queue.
  const places = await probePlacesQuota()
  if (!places.available) {
    console.warn(`[prospect] Google Places unavailable (${places.status}: ${places.reason}) — OSM-only this run`)
  }

  const verticalsToRun = onlyVertical && AUTO_VERTICALS.includes(onlyVertical)
    ? [onlyVertical]
    : AUTO_VERTICALS

  // Shared dedup sets, loaded once.
  const dedup = await buildDedupSets(sb)

  const results = []
  let totalQueued = 0
  let totalGatesPassedButNotInserted = 0
  let totalDisqualified = 0
  let totalDiscovered = 0
  const disqualifiedByGate = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const vertical of verticalsToRun) {
    try {
      const report = await replenishVertical(sb, vertical, {
        target: TARGET_PER_VERTICAL,
        maxNew: MAX_NEW_PER_VERTICAL,
        dryRun,
        dedup,
        deadlineMs,
        placesAvailable: places.available,
        log: (m) => console.log(m),
      })
      totalQueued += report.queued
      totalGatesPassedButNotInserted += report.gates_passed_but_not_inserted
      totalDisqualified += report.disqualified
      totalDiscovered += report.discovered
      for (const g of [0, 1, 2, 3, 4]) {
        disqualifiedByGate[g] += report.disqualified_by_gate?.[g] || 0
      }
      results.push(report)
    } catch (err) {
      console.error(`[prospect] ${vertical} error:`, err.message)
      results.push({
        vertical, verticalName: VERTICAL_NAMES[vertical] || vertical,
        discovered: 0, queued: 0, disqualified: 0, status: 'error', error: err.message,
      })
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[prospect] Done in ${duration}s — ${totalDiscovered} discovered, ${totalQueued} queued, ${totalGatesPassedButNotInserted} insert-failed, ${totalDisqualified} disqualified`)

  return NextResponse.json({
    success: true,
    source: places.available ? 'osm_overpass+google_places' : 'osm_overpass',
    google_places: { available: places.available, status: places.status, reason: places.reason },
    date: new Date().toISOString().split('T')[0],
    duration_seconds: parseFloat(duration),
    total_discovered: totalDiscovered,
    total_queued: totalQueued,
    total_gates_passed_but_not_inserted: totalGatesPassedButNotInserted,
    total_disqualified: totalDisqualified,
    disqualified_by_gate: {
      gate_0_dedup: disqualifiedByGate[0],
      gate_1_web_presence: disqualifiedByGate[1],
      gate_2_address_region: disqualifiedByGate[2],
      gate_3_business_activity: disqualifiedByGate[3],
      gate_4_vertical_fit: disqualifiedByGate[4],
    },
    dry_run: dryRun,
    results,
  })
}
