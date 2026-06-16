/**
 * One-shot floor seeder — fills each Atlas's candidate queue up to FLOOR using
 * the quota-free OSM Overpass discovery source through the standard 5-gate
 * pipeline. Mirrors what /api/cron/ensure-candidates now does, but without the
 * serverless wall-clock limit so it can fill all nine verticals in one pass.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-osm-floor.mjs            # all verticals, floor 10
 *   node --env-file=.env.local scripts/seed-osm-floor.mjs --floor=10 --vertical=sba
 */
import { createClient } from '@supabase/supabase-js'
import { replenishVertical, buildDedupSets, AUTO_VERTICALS } from '../lib/prospector/replenish.js'
import { probePlacesQuota } from '../lib/prospector/google-places.js'

const args = process.argv.slice(2)
const floorArg = args.find(a => a.startsWith('--floor='))
const vertArg = args.find(a => a.startsWith('--vertical='))
const FLOOR = floorArg ? parseInt(floorArg.split('=')[1], 10) : 10
const only = vertArg ? vertArg.split('=')[1] : null

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
})

const places = await probePlacesQuota()
console.log(`Google Places: ${places.available ? 'AVAILABLE' : 'UNAVAILABLE'} (${places.status}${places.reason ? ': ' + places.reason : ''})`)
console.log(`Primary source: OSM Overpass — floor ${FLOOR}\n`)

const verticals = only ? [only] : AUTO_VERTICALS
const dedup = await buildDedupSets(sb)
const summary = []

for (const v of verticals) {
  const { count } = await sb.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('vertical', v)
  const pending = count || 0
  if (pending >= FLOOR) {
    console.log(`\n── ${v}: already ${pending}/${FLOOR} — skip`)
    summary.push({ vertical: v, pending_before: pending, queued: 0, pending_after: pending, status: 'skipped' })
    continue
  }
  console.log(`\n── ${v}: ${pending}/${FLOOR} pending — replenishing ${FLOOR - pending}…`)
  try {
    const report = await replenishVertical(sb, v, {
      target: FLOOR,
      maxNew: FLOOR - pending,
      dedup,
      placesAvailable: places.available,
      osmMaxResults: 250,
      log: (m) => console.log('   ' + m),
    })
    console.log(`   → discovered ${report.discovered}, queued ${report.queued}, disqualified ${report.disqualified} ${JSON.stringify(report.disqualified_by_gate)}`)
    summary.push({ vertical: v, pending_before: pending, queued: report.queued, pending_after: report.pending_after, disq: report.disqualified_by_gate })
  } catch (err) {
    console.log(`   ✗ ERROR: ${err.message}`)
    summary.push({ vertical: v, pending_before: pending, queued: 0, status: 'error', error: err.message })
  }
}

console.log('\n\n=== SEED SUMMARY ===')
for (const s of summary) {
  console.log(`${(s.vertical + ':').padEnd(15)} ${String(s.pending_before).padStart(2)} → ${String(s.pending_after ?? s.pending_before).padStart(2)}   (+${s.queued})${s.status === 'error' ? '  ERROR ' + s.error : ''}`)
}
const belowFloor = summary.filter(s => (s.pending_after ?? s.pending_before) < FLOOR)
console.log(`\nBelow floor (${FLOOR}): ${belowFloor.map(s => s.vertical).join(', ') || 'NONE — all verticals at floor ✓'}`)
