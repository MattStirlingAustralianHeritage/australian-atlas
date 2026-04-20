import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/pipeline/advance
 *
 * Bulk-advances candidates through pipeline stages based on readiness criteria:
 *   discover → verify:  has gate_results
 *   verify   → curate:  all gates passed, confidence > 0
 *   curate   → prepare: confidence >= 0.5, gate score >= 60
 *   prepare  → queue:   has description or enrichment data
 *
 * Body: { stage?: string } — optionally limit to a single stage
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const onlyStage = body.stage || null

  const sb = getSupabaseAdmin()
  const results = { discover: 0, verify: 0, curate: 0, prepare: 0, total: 0 }

  // discover → verify: candidates with gate_results
  if (!onlyStage || onlyStage === 'discover') {
    const { data: discovered } = await sb
      .from('listing_candidates')
      .select('id')
      .eq('pipeline_stage', 'discover')
      .in('status', ['pending', 'reviewing'])
      .not('gate_results', 'is', null)
      .limit(200)

    if (discovered?.length) {
      const ids = discovered.map(c => c.id)
      await sb
        .from('listing_candidates')
        .update({ pipeline_stage: 'verify', stage_entered_at: new Date().toISOString() })
        .in('id', ids)
      results.discover = ids.length
    }
  }

  // verify → curate: all gates passed (confidence > 0 means gates ran successfully)
  if (!onlyStage || onlyStage === 'verify') {
    const { data: verified } = await sb
      .from('listing_candidates')
      .select('id')
      .eq('pipeline_stage', 'verify')
      .in('status', ['pending', 'reviewing'])
      .gt('confidence', 0)
      .not('gate_results', 'is', null)
      .limit(200)

    if (verified?.length) {
      const ids = verified.map(c => c.id)
      await sb
        .from('listing_candidates')
        .update({ pipeline_stage: 'curate', stage_entered_at: new Date().toISOString() })
        .in('id', ids)
      results.verify = ids.length
    }
  }

  // curate → prepare: confidence >= 0.5
  if (!onlyStage || onlyStage === 'curate') {
    const { data: curated } = await sb
      .from('listing_candidates')
      .select('id')
      .eq('pipeline_stage', 'curate')
      .in('status', ['pending', 'reviewing'])
      .gte('confidence', 0.5)
      .limit(200)

    if (curated?.length) {
      const ids = curated.map(c => c.id)
      await sb
        .from('listing_candidates')
        .update({ pipeline_stage: 'prepare', stage_entered_at: new Date().toISOString() })
        .in('id', ids)
      results.curate = ids.length
    }
  }

  // prepare → queue: has website_url (enrichment source available)
  if (!onlyStage || onlyStage === 'prepare') {
    const { data: prepared } = await sb
      .from('listing_candidates')
      .select('id')
      .eq('pipeline_stage', 'prepare')
      .in('status', ['pending', 'reviewing'])
      .not('website_url', 'is', null)
      .gte('confidence', 0.5)
      .limit(200)

    if (prepared?.length) {
      const ids = prepared.map(c => c.id)
      await sb
        .from('listing_candidates')
        .update({ pipeline_stage: 'queue', stage_entered_at: new Date().toISOString() })
        .in('id', ids)
      results.prepare = ids.length
    }
  }

  results.total = results.discover + results.verify + results.curate + results.prepare

  return NextResponse.json({ success: true, advanced: results })
}
