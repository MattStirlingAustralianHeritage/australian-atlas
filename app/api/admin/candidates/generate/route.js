import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { replenishVertical, buildDedupSets, AUTO_VERTICALS, VERTICAL_NAMES } from '@/lib/prospector/replenish'

/**
 * POST /api/admin/candidates/generate
 *
 * On-demand candidate generation — the manual counterpart to the daily crons,
 * sharing the same discovery core (lib/prospector/replenish.js): rotating
 * regional towns first, capital centres as top-up, full 5-gate verification.
 *
 * Body: { vertical?: string } — optional single-vertical filter
 * Auth: admin cookie
 *
 * Tops each vertical up to GENERATE_TARGET so a reviewer who has worked a queue
 * down to zero can refill it to a comfortable floor on demand.
 */

const GENERATE_TARGET = 12
const GENERATE_MAX_NEW = 12

export const maxDuration = 300

export async function POST(request) {
  try {
    const cookieStore = await cookies()
    if (!(await checkAdmin(cookieStore))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const onlyVertical = body.vertical || null

    // Way is seeded via its own supervised, cultural-authority-vetted pipeline,
    // never auto-prospected from Google Places.
    if (onlyVertical === 'way') {
      return NextResponse.json({
        success: true,
        source: 'google_places',
        date: new Date().toISOString().split('T')[0],
        duration_seconds: 0,
        total_queued: 0,
        results: [{
          vertical: 'way', verticalName: 'Way Atlas', queued: 0, status: 'needs_manual',
          reason: 'Way candidates require cultural-authority vetting — seed via the supervised Way discovery (scripts/way-discover.mjs).',
        }],
      })
    }

    const sb = getSupabaseAdmin()
    const startTime = Date.now()
    const deadlineMs = startTime + 270000

    const verticalsToRun = onlyVertical && AUTO_VERTICALS.includes(onlyVertical)
      ? [onlyVertical]
      : AUTO_VERTICALS

    const dedup = await buildDedupSets(sb)

    const results = []
    let totalQueued = 0

    for (const vertical of verticalsToRun) {
      try {
        const report = await replenishVertical(sb, vertical, {
          target: GENERATE_TARGET,
          maxNew: GENERATE_MAX_NEW,
          dryRun: false,
          dedup,
          deadlineMs,
          log: () => {},
        })
        totalQueued += report.queued
        results.push(report)
      } catch (err) {
        console.error(`[generate] ${vertical} error:`, err.message)
        results.push({
          vertical, verticalName: VERTICAL_NAMES[vertical] || vertical,
          queued: 0, status: 'error', error: err.message,
        })
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    return NextResponse.json({
      success: true,
      source: 'google_places',
      date: new Date().toISOString().split('T')[0],
      duration_seconds: parseFloat(duration),
      total_queued: totalQueued,
      results,
    })
  } catch (err) {
    console.error('[generate] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error', success: false }, { status: 500 })
  }
}
