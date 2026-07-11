import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateTradeNotesBatch } from '@/lib/outreach/tradePersonalise'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_CALL = 20

/**
 * POST /api/admin/trade-outreach/personalise
 * AI-write a one-line personal opener for each trade company and store it on
 * trade_outreach.personal_note. Grounded in what the company sells, its focus
 * region (with our listing count and a few real venue names) when linked,
 * else the network-wide count.
 *
 * Body: { trade_ids: string[] }  (max 20 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const tradeIds = Array.isArray(body.trade_ids) ? body.trade_ids.slice(0, MAX_PER_CALL) : []
  if (tradeIds.length === 0) {
    return NextResponse.json({ error: 'trade_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: companies, error: cErr } = await sb
    .from('trade_outreach')
    .select('id, company_name, org_type, focus, state, region_id, region_name, regions:region_id (id, name, state, listing_count)')
    .in('id', tradeIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Network-wide count grounds openers for companies with no linked region.
  let networkCount = null
  try {
    const { count } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
    networkCount = count ?? null
  } catch { /* optional grounding */ }

  // A few real venue names per focus region so the opener can be concrete
  // without fabricating anything. Best-effort — a view/query failure just
  // means the opener grounds itself in the counts alone.
  const regionIds = [...new Set((companies || []).map((c) => c.regions?.id || c.region_id).filter(Boolean))]
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

  const inputs = (companies || []).map((c) => {
    const region = c.regions || null
    const rid = region?.id || c.region_id
    return {
      id: c.id,
      company_name: c.company_name,
      org_type: c.org_type || null,
      focus: c.focus || null,
      region: region?.name || c.region_name || null,
      state: c.state || region?.state || null,
      listing_count: region?.listing_count ?? null,
      network_count: networkCount,
      examples: rid ? (examplesByRegion.get(rid) || []) : [],
    }
  })

  const generated = await generateTradeNotesBatch(inputs, 4)

  const now = new Date().toISOString()
  const results = []
  for (const g of generated) {
    if (g.personal_note) {
      await sb
        .from('trade_outreach')
        .update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now })
        .eq('id', g.id)
    }
    results.push({ trade_id: g.id, personal_note: g.personal_note || null })
  }

  return NextResponse.json({ ok: true, wrote: results.filter((r) => r.personal_note).length, results })
}
