import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { replenishVertical, buildDedupSets, AUTO_VERTICALS, VERTICAL_NAMES } from '@/lib/prospector/replenish'
import { dayOfYear } from '@/lib/prospector/regional-centers'

/**
 * GET /api/cron/ensure-candidates
 *
 * Daily floor guarantee for the candidate review queue.
 *
 * Goal: every Atlas starts each day with at least FLOOR candidates to review.
 * As the reviewer works a vertical down to zero, the next morning's run tops it
 * back up to the floor. This is the safety net beneath the deeper prospect cron
 * (which builds backlog toward 100); even on a day the prospector adds little,
 * this guarantees a reviewable floor.
 *
 * Behaviour per vertical:
 *   - 9 Google-Places verticals: if pending < FLOOR, replenish up to FLOOR.
 *   - way: checked but NOT auto-prospected — Way needs cultural-authority
 *     vetting and is seeded via its own supervised pipeline. If Way drops
 *     below the floor it is surfaced as `needs_manual` so it isn't missed.
 *
 * Verticals are processed emptiest-first under a wall-clock budget, so the
 * neediest queues fill even if the run can't reach every vertical in one pass.
 *
 * Auth: Bearer CRON_SECRET (or admin — see middleware). Query: ?vertical=, ?dry_run=, ?floor=
 */

export const maxDuration = 300

const FLOOR = 10
const ALL_VERTICALS = [...AUTO_VERTICALS, 'way']
// Leave headroom under maxDuration so the final vertical's pipeline + the
// response both finish before the platform kills the function.
const TIME_BUDGET_MS = 270000

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({
      error: 'GOOGLE_PLACES_API_KEY not configured — cannot replenish from a verified source',
    }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const onlyVertical = searchParams.get('vertical')
  const dryRun = searchParams.get('dry_run') === 'true'
  const floor = parseInt(searchParams.get('floor') || '', 10) || FLOOR

  const sb = getSupabaseAdmin()
  const startTime = Date.now()
  const deadlineMs = startTime + TIME_BUDGET_MS
  const rotationSeed = dayOfYear()

  // Current pending depth for every vertical.
  const depth = {}
  for (const v of ALL_VERTICALS) {
    const { count } = await sb
      .from('listing_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('vertical', v)
    depth[v] = count || 0
  }

  // Which verticals need attention, emptiest-first.
  const targets = (onlyVertical ? [onlyVertical] : ALL_VERTICALS)
    .filter(v => ALL_VERTICALS.includes(v))
    .filter(v => depth[v] < floor)
    .sort((a, b) => depth[a] - depth[b])

  // Build dedup sets once (shared across all verticals this run).
  const dedup = targets.some(v => v !== 'way') ? await buildDedupSets(sb) : null

  const results = []
  let totalQueued = 0

  for (const vertical of ALL_VERTICALS) {
    if (onlyVertical && vertical !== onlyVertical) continue
    const pending = depth[vertical]

    if (pending >= floor) {
      results.push({ vertical, verticalName: VERTICAL_NAMES[vertical] || vertical, pending_before: pending, queued: 0, reached_target: true, status: 'skipped', reason: `Already at ${pending}/${floor}` })
      continue
    }

    // Way is never auto-prospected — surface it for the supervised pipeline.
    if (vertical === 'way') {
      results.push({
        vertical, verticalName: 'Way Atlas', pending_before: pending, queued: 0,
        reached_target: false, status: 'needs_manual',
        reason: `Way is below the floor (${pending}/${floor}). Way candidates require cultural-authority vetting — run the supervised Way discovery (scripts/way-discover.mjs), not auto-prospecting.`,
      })
      continue
    }

    if (Date.now() >= deadlineMs) {
      results.push({ vertical, verticalName: VERTICAL_NAMES[vertical] || vertical, pending_before: pending, queued: 0, reached_target: false, status: 'skipped_time', reason: 'Ran out of time budget this run; will retry next run' })
      continue
    }

    const report = await replenishVertical(sb, vertical, {
      target: floor,
      maxNew: floor,
      dryRun,
      dedup,
      rotationSeed,
      deadlineMs,
      log: (m) => console.log(m),
    })
    totalQueued += report.queued
    results.push(report)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Surface verticals still below the floor so a shortfall is never silent.
  const belowFloor = results
    .filter(r => r.reached_target === false)
    .map(r => ({ vertical: r.vertical, pending: (r.pending_after ?? r.pending_before), status: r.status }))

  console.log(`[ensure-candidates] Done in ${duration}s — floor ${floor}, queued ${totalQueued}, below-floor: ${belowFloor.map(b => b.vertical).join(', ') || 'none'}`)

  return NextResponse.json({
    success: true,
    floor,
    date: new Date().toISOString().split('T')[0],
    duration_seconds: parseFloat(duration),
    total_queued: totalQueued,
    below_floor: belowFloor,
    dry_run: dryRun,
    results,
  })
}
