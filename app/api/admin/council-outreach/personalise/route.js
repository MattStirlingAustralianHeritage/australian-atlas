import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateCouncilNotesBatch } from '@/lib/outreach/councilPersonalise'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_CALL = 20

/**
 * POST /api/admin/council-outreach/personalise
 * AI-write a one-line personal opener for each council and store it on
 * council_outreach.personal_note. Grounded in the region we cover, how many
 * places we've mapped there, and a few real venue names from our own guide.
 *
 * Body: { council_ids: string[] }  (max 20 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const councilIds = Array.isArray(body.council_ids) ? body.council_ids.slice(0, MAX_PER_CALL) : []
  if (councilIds.length === 0) {
    return NextResponse.json({ error: 'council_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: councils, error: cErr } = await sb
    .from('council_outreach')
    .select('id, council_name, state, region_id, region_name, regions:region_id (id, name, state, listing_count)')
    .in('id', councilIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // A few real venue names per region so the opener can be concrete without
  // fabricating anything. Best-effort — a view/query failure just means the
  // opener grounds itself in the region + count alone.
  const regionIds = [...new Set((councils || []).map((c) => c.regions?.id || c.region_id).filter(Boolean))]
  const examplesByRegion = new Map()
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

  const inputs = (councils || []).map((c) => {
    const region = c.regions || null
    const rid = region?.id || c.region_id
    return {
      id: c.id,
      council_name: c.council_name,
      region: region?.name || c.region_name || null,
      state: c.state || region?.state || null,
      listing_count: region?.listing_count ?? null,
      examples: rid ? (examplesByRegion.get(rid) || []) : [],
    }
  })

  const generated = await generateCouncilNotesBatch(inputs, 4)

  const now = new Date().toISOString()
  const results = []
  for (const g of generated) {
    if (g.personal_note) {
      await sb
        .from('council_outreach')
        .update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now })
        .eq('id', g.id)
    }
    results.push({ council_id: g.id, personal_note: g.personal_note || null })
  }

  return NextResponse.json({ ok: true, wrote: results.filter((r) => r.personal_note).length, results })
}
