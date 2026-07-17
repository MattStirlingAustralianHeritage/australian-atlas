import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generatePressNotesBatch } from '@/lib/outreach/pressPersonalise'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_CALL = 20

/**
 * POST /api/admin/press-outreach/personalise
 * AI-write a one-line personal opener for each press contact and store it on
 * press_outreach.personal_note. Grounded in the outlet, the journalist's beat,
 * the region/state we can offer them, and a few real venue names from our guide.
 *
 * Body: { press_ids: string[] }  (max 20 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const pressIds = Array.isArray(body.press_ids) ? body.press_ids.slice(0, MAX_PER_CALL) : []
  if (pressIds.length === 0) {
    return NextResponse.json({ error: 'press_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: rows, error: cErr } = await sb
    .from('press_outreach')
    .select('id, outlet_name, journalist_name, beat, state, region_id, region_name, regions:region_id (id, name, state)')
    .in('id', pressIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // A few real venue names to ground the opener without fabricating. Prefer the
  // contact's region; fall back to their state. Best-effort — a query failure
  // just means the opener grounds itself in the outlet + beat alone.
  const regionIds = [...new Set((rows || []).map((c) => c.regions?.id || c.region_id).filter(Boolean))]
  const states = [...new Set((rows || []).map((c) => c.state).filter(Boolean))]
  const examplesByRegion = new Map()
  const examplesByState = new Map()

  if (regionIds.length) {
    try {
      const { data: venues } = await sb
        .from('listings_with_region')
        .select('name, region_id, quality_score')
        .in('region_id', regionIds)
        .eq('status', 'active')
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(regionIds.length * 12)
      for (const v of venues || []) {
        const list = examplesByRegion.get(v.region_id) || []
        if (list.length < 3) { list.push(v.name); examplesByRegion.set(v.region_id, list) }
      }
    } catch { /* examples are optional */ }
  }
  if (states.length) {
    try {
      const { data: venues } = await sb
        .from('listings_with_region')
        .select('name, state, quality_score')
        .in('state', states)
        .eq('status', 'active')
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(states.length * 12)
      for (const v of venues || []) {
        const list = examplesByState.get(v.state) || []
        if (list.length < 3) { list.push(v.name); examplesByState.set(v.state, list) }
      }
    } catch { /* examples are optional */ }
  }

  const inputs = (rows || []).map((c) => {
    const region = c.regions || null
    const rid = region?.id || c.region_id
    const examples = (rid && examplesByRegion.get(rid)) || (c.state && examplesByState.get(c.state)) || []
    return {
      id: c.id,
      outlet_name: c.outlet_name,
      journalist_name: c.journalist_name || null,
      beat: c.beat || [],
      region: region?.name || c.region_name || null,
      state: c.state || region?.state || null,
      examples,
    }
  })

  const generated = await generatePressNotesBatch(inputs, 4)

  const now = new Date().toISOString()
  const results = []
  for (const g of generated) {
    if (g.personal_note) {
      await sb
        .from('press_outreach')
        .update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now })
        .eq('id', g.id)
    }
    results.push({ press_id: g.id, personal_note: g.personal_note || null })
  }

  return NextResponse.json({ ok: true, wrote: results.filter((r) => r.personal_note).length, results })
}
