import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'
import { resolveVerticals } from '@/lib/plan-a-stay/intent-verticals'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay — region recommendation
   ═══════════════════════════════════════════════════════════════════════
   "Not sure where yet" → score every qualifying region (the same ≥5-stays
   set the region picker shows) against the trip described so far:

     depth      — enough intent-matched places for the requested days
     diversity  — how many of the intent's verticals the region covers
     stays      — accommodation coverage (already the qualifying metric)

   Everything returned is a live count — the client renders the counts
   themselves as the "why", so nothing is asserted that isn't in the DB. */

const RECOMMENDATION_COUNT = 3
const BREAKDOWN_VERTICALS = 3

/* PostgREST caps result sets at 1000 rows — paginate (sba/craft alone
   are >2000 active listings each). */
async function fetchIntentRows(sb, verticals) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listings_with_region')
      .select('region_id, vertical')
      .eq('status', 'active')
      .eq('visitable', true)
      .in('vertical', verticals)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function POST(request) {
  try {
    const body = await request.json()
    const intent = Array.isArray(body.intent) ? body.intent : []
    const duration = typeof body.duration === 'number' && body.duration >= 1 && body.duration <= 7
      ? body.duration
      : 3

    if (intent.length === 0) {
      return NextResponse.json({ error: 'intent is required (array of 1-2)' }, { status: 400 })
    }

    const { primary } = resolveVerticals(intent)
    if (primary.length === 0) {
      return NextResponse.json({ error: 'unknown intent' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const [qualifying, regionRows, intentRows] = await Promise.all([
      getQualifyingRegions(),
      sb.from('regions').select('id, name').then(({ data }) => data || []),
      fetchIntentRows(sb, primary),
    ])

    const idByName = new Map(regionRows.map(r => [r.name, r.id]))

    // region_id → vertical → count
    const countsByRegion = new Map()
    for (const row of intentRows) {
      if (!row.region_id) continue
      let m = countsByRegion.get(row.region_id)
      if (!m) { m = new Map(); countsByRegion.set(row.region_id, m) }
      m.set(row.vertical, (m.get(row.vertical) || 0) + 1)
    }

    const scored = []
    for (const q of qualifying) {
      const regionId = idByName.get(q.name)
      const verticalCounts = (regionId && countsByRegion.get(regionId)) || new Map()
      const intentTotal = [...verticalCounts.values()].reduce((a, b) => a + b, 0)
      if (intentTotal === 0) continue

      const depth = Math.min(1, intentTotal / (duration * 3))
      const diversity = verticalCounts.size / primary.length
      const stays = Math.min(1, (q.listing_count || 0) / 20)
      const score = depth * 0.5 + diversity * 0.3 + stays * 0.2

      const breakdown = [...verticalCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, BREAKDOWN_VERTICALS)
        .map(([vertical, count]) => ({ vertical, count }))

      scored.push({
        name: q.name,
        state: q.state,
        stays: q.listing_count || 0,
        intent_total: intentTotal,
        deep_enough: intentTotal >= duration * 2,
        breakdown,
        score: Math.round(score * 1000) / 1000,
      })
    }

    // Depth-gated first; if the gate leaves fewer than needed, backfill with
    // the best of the rest so the visitor always gets an answer.
    scored.sort((a, b) => b.score - a.score)
    const deep = scored.filter(s => s.deep_enough)
    const shallow = scored.filter(s => !s.deep_enough)
    const recommendations = [...deep, ...shallow]
      .slice(0, RECOMMENDATION_COUNT)
      .map(({ score, deep_enough, ...rest }) => rest)

    return NextResponse.json({
      recommendations,
      considered: scored.length,
      intent,
      duration,
    })
  } catch (err) {
    console.error('[plan-a-stay/recommend]', err)
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 })
  }
}
