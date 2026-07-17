import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'

export const dynamic = 'force-dynamic'
// Same budget rationale as the operator/council discover route: each site is
// hard-capped inside discoverEmailsBatch, so 120s makes a serverless timeout
// effectively impossible.
export const maxDuration = 120

/**
 * POST /api/admin/press-outreach/discover
 * Discover contact emails for a set of press contacts by scraping their outlet
 * / staff-page website, and persist the outcome onto press_outreach.
 *
 * Body: { press_ids: string[] }   (max 30 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const pressIds = Array.isArray(body.press_ids) ? body.press_ids.slice(0, 30) : []
  if (pressIds.length === 0) {
    return NextResponse.json({ error: 'press_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: rows, error: cErr } = await sb
    .from('press_outreach')
    .select('id, outlet_name, journalist_name, website, contact_email')
    .in('id', pressIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const withSites = (rows || []).filter((c) => c.website && !c.contact_email)
  const discovered = await discoverEmailsBatch(
    withSites.map((c) => ({ id: c.id, website: c.website })),
    6,
    { deadlineMs: 100_000 }
  )
  const byId = new Map(discovered.map((d) => [d.id, d]))

  const now = new Date().toISOString()
  const results = []
  const statusCounts = { found: 0, no_email: 0, dead: 0, blocked: 0 }

  for (const c of rows || []) {
    const displayName = c.journalist_name ? `${c.journalist_name} · ${c.outlet_name}` : c.outlet_name
    // Never clobber a manually-set / imported address.
    if (c.contact_email) {
      results.push({ press_id: c.id, name: displayName, website: c.website, email: c.contact_email, status: 'has_email', candidates: [], source: null, saved: false })
      continue
    }
    const d = byId.get(c.id)
    if (!d) {
      // Not scanned this run (deadline) — retried on the next Discover pass.
      results.push({ press_id: c.id, name: displayName, website: c.website || null, email: null, status: 'pending', candidates: [], source: null, saved: false })
      continue
    }

    const email = d.email || null
    const status = d.status || (email ? 'found' : 'no_email')
    statusCounts[status] = (statusCounts[status] || 0) + 1
    let saved = false

    if (email) {
      const { error } = await sb
        .from('press_outreach')
        .update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now })
        .eq('id', c.id)
      saved = !error
    } else {
      // Record dead / no_email / blocked so a repeat Discover skips this site
      // (email_source doubles as the outcome while contact_email is null).
      await sb
        .from('press_outreach')
        .update({ email_source: status, discovered_at: now, updated_at: now })
        .eq('id', c.id)
    }

    results.push({
      press_id: c.id,
      name: displayName,
      website: c.website || null,
      email,
      status,
      candidates: d.candidates || [],
      source: d.source || null,
      saved,
    })
  }

  const foundCount = results.filter((r) => r.email && r.status === 'found').length
  const timedOut = discovered.length < withSites.length
  return NextResponse.json({ ok: true, statusCounts, scanned: discovered.length, found: foundCount, timedOut, results })
}
