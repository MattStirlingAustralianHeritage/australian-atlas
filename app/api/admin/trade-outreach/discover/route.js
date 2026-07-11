import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'

export const dynamic = 'force-dynamic'
// Same budget rationale as the operator/council discover routes: each site is
// hard-capped inside discoverEmailsBatch, so 120s makes a serverless timeout
// effectively impossible.
export const maxDuration = 120

/**
 * POST /api/admin/trade-outreach/discover
 * Discover contact emails for a set of trade companies by scraping their
 * official websites, and persist the outcome onto trade_outreach.
 *
 * Body: { trade_ids: string[] }   (max 30 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const tradeIds = Array.isArray(body.trade_ids) ? body.trade_ids.slice(0, 30) : []
  if (tradeIds.length === 0) {
    return NextResponse.json({ error: 'trade_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: companies, error: cErr } = await sb
    .from('trade_outreach')
    .select('id, company_name, website, contact_email')
    .in('id', tradeIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const withSites = (companies || []).filter((c) => c.website && !c.contact_email)
  const discovered = await discoverEmailsBatch(
    withSites.map((c) => ({ id: c.id, website: c.website })),
    6,
    { deadlineMs: 100_000 }
  )
  const byId = new Map(discovered.map((d) => [d.id, d]))
  const timedOut = discovered.length < withSites.length

  const now = new Date().toISOString()
  const results = []
  const statusCounts = { found: 0, no_email: 0, dead: 0, blocked: 0 }

  for (const c of companies || []) {
    // Never clobber a manually-set / imported address.
    if (c.contact_email) {
      results.push({ trade_id: c.id, name: c.company_name, website: c.website, email: c.contact_email, status: 'has_email', candidates: [], source: null, saved: false })
      continue
    }
    const d = byId.get(c.id)
    if (!d) {
      // Not scanned this run (deadline) — retried on the next Discover pass.
      results.push({ trade_id: c.id, name: c.company_name, website: c.website || null, email: null, status: 'pending', candidates: [], source: null, saved: false })
      continue
    }

    const email = d.email || null
    const status = d.status || (email ? 'found' : 'no_email')
    statusCounts[status] = (statusCounts[status] || 0) + 1
    let saved = false

    if (email) {
      const { error } = await sb
        .from('trade_outreach')
        .update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now })
        .eq('id', c.id)
      saved = !error
    } else {
      // Record dead / no_email / blocked so a repeat Discover skips this site
      // and the UI can explain why it's empty (email_source doubles as the
      // outcome while contact_email is null — same overload as operators).
      await sb
        .from('trade_outreach')
        .update({ email_source: status, discovered_at: now, updated_at: now })
        .eq('id', c.id)
    }

    results.push({
      trade_id: c.id,
      name: c.company_name,
      website: c.website || null,
      email,
      status,
      candidates: d.candidates || [],
      source: d.source || null,
      saved,
    })
  }

  const foundCount = results.filter((r) => r.email && r.status === 'found').length
  return NextResponse.json({ ok: true, statusCounts, scanned: discovered.length, found: foundCount, timedOut, results })
}
