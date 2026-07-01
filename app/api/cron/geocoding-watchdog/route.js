import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { validateGeocode } from '@/lib/agents/geocoding-watchdog'

/**
 * GET /api/cron/geocoding-watchdog
 *
 * Weekly geocode validator. lib/agents/geocoding-watchdog.js shipped with
 * the original agent batch but was never wired to a schedule or caller —
 * this route puts it to work: reverse-geocodes listing coordinates via
 * Mapbox and writes geocode_confidence / geocode_warning. Non-destructive
 * (never moves a pin) — low-confidence rows surface for human review.
 *
 * Works oldest-first through active listings that have coordinates but no
 * confidence verdict yet, capped per run to keep Mapbox usage trivial
 * (~MAX_PER_RUN reverse geocodes weekly).
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const MAX_PER_RUN = 100
const DELAY_MS = 250 // ~4 req/s, well under Mapbox's 600/min geocoding limit
const TIME_BUDGET_MS = 270000

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('geocoding-watchdog')
  const deadlineMs = Date.now() + TIME_BUDGET_MS

  const counts = {
    checked: 0,
    high_confidence: 0,
    low_confidence: 0,
    errors: 0,
  }

  try {
    const { data: listings, error: fetchError } = await sb
      .from('listings')
      .select('id, name, lat, lng, suburb, state, address')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .is('geocode_confidence', null)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN)

    if (fetchError) throw fetchError

    const backlog = listings?.length || 0

    for (const listing of listings || []) {
      if (Date.now() >= deadlineMs) break

      try {
        const { confidence, warning } = await validateGeocode(listing)
        counts.checked++
        if (confidence === 'high') counts.high_confidence++
        if (confidence === 'low') {
          counts.low_confidence++
          console.log(`[geocoding-watchdog] LOW: "${listing.name}" — ${warning}`)
        }
      } catch (err) {
        counts.errors++
        console.error(`[geocoding-watchdog] Error for "${listing.name}": ${err.message}`)
      }

      await delay(DELAY_MS)
    }

    console.log(
      `[geocoding-watchdog] Done — checked: ${counts.checked}/${backlog}, high: ${counts.high_confidence}, low: ${counts.low_confidence}, errors: ${counts.errors}`
    )

    await completeRun(runId, {
      status: counts.errors > 0 && counts.checked === 0 ? 'error' : 'success',
      summary: { ...counts, batch: backlog },
    })

    return NextResponse.json({ success: true, ...counts })
  } catch (err) {
    console.error('[geocoding-watchdog] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: 'Geocoding watchdog failed', detail: err.message }, { status: 500 })
  }
}
