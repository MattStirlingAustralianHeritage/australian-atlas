import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'

export const dynamic = 'force-dynamic'
// Same budget rationale as the operator discover route: each site is
// hard-capped inside discoverEmailsBatch, so 120s makes a serverless timeout
// effectively impossible.
export const maxDuration = 120

/**
 * POST /api/admin/council-outreach/discover
 * Discover contact emails for a set of councils by scraping their official
 * websites, and persist the outcome onto council_outreach.
 *
 * Body: { council_ids: string[] }   (max 30 per call)
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const councilIds = Array.isArray(body.council_ids) ? body.council_ids.slice(0, 30) : []
  if (councilIds.length === 0) {
    return NextResponse.json({ error: 'council_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: councils, error: cErr } = await sb
    .from('council_outreach')
    .select('id, council_name, website, contact_email')
    .in('id', councilIds)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const withSites = (councils || []).filter((c) => c.website && !c.contact_email)
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

  for (const c of councils || []) {
    // Never clobber a manually-set / imported address.
    if (c.contact_email) {
      results.push({ council_id: c.id, name: c.council_name, website: c.website, email: c.contact_email, status: 'has_email', candidates: [], source: null, saved: false })
      continue
    }
    const d = byId.get(c.id)
    if (!d) {
      // Not scanned this run (deadline) — retried on the next Discover pass.
      results.push({ council_id: c.id, name: c.council_name, website: c.website || null, email: null, status: 'pending', candidates: [], source: null, saved: false })
      continue
    }

    const email = d.email || null
    const status = d.status || (email ? 'found' : 'no_email')
    statusCounts[status] = (statusCounts[status] || 0) + 1
    let saved = false

    if (email) {
      const { error } = await sb
        .from('council_outreach')
        .update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now })
        .eq('id', c.id)
      saved = !error
    } else {
      // Record dead / no_email / blocked so a repeat Discover skips this site
      // and the UI can explain why it's empty (email_source doubles as the
      // outcome while contact_email is null — same overload as operators).
      await sb
        .from('council_outreach')
        .update({ email_source: status, discovered_at: now, updated_at: now })
        .eq('id', c.id)
    }

    results.push({
      council_id: c.id,
      name: c.council_name,
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
