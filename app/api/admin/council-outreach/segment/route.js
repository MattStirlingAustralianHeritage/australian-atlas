import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

/**
 * POST /api/admin/council-outreach/segment
 * Resolve a council recipient segment for the compose UI, enriched with
 * outreach state (email, suppression, prior send) and the joined region.
 *
 * Body: { state?, q?, status?, limit? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const state = body.state || null
  const q = body.q ? String(body.q).trim() : null
  const funnel = body.status || null
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500)

  const sb = getSupabaseAdmin()

  let query = sb
    .from('council_outreach')
    .select('id, council_name, state, website, region_id, region_name, covers, contact_name, contact_role, contact_email, email_source, discovered_at, personal_note, status, send_status, sent_at, campaign_id, last_contacted_at, notes, regions:region_id (id, name, slug, state, listing_count)')
    .order('council_name', { ascending: true })
    .limit(limit)

  if (state) query = query.eq('state', state)
  if (funnel) query = query.eq('status', funnel)
  if (q) query = query.or(`council_name.ilike.%${q}%,region_name.ilike.%${q}%`)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Suppression set for the emails we know about.
  const emails = (rows || []).map((r) => r.contact_email).filter(Boolean)
  const suppressed = new Set()
  if (emails.length) {
    const lowered = [...new Set(emails.map((e) => e.toLowerCase()))]
    const { data: srows } = await sb
      .from('outreach_suppressions')
      .select('email')
      .in('email', lowered)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  const enriched = (rows || []).map((r) => {
    const email = r.contact_email || null
    const isSuppressed = email ? suppressed.has(email.toLowerCase()) : false
    const sendStatus = r.send_status || null
    const sendable = !!email && !isSuppressed && !UNSENDABLE_STATUSES.has(sendStatus) && r.status !== 'onboarded'
    // Same semantics as operator outreach: when an email is present email_source
    // is provenance; when absent it holds the last website-check outcome.
    const websiteStatus = email
      ? 'has_email'
      : (r.discovered_at ? (r.email_source || 'no_email') : null)
    const region = r.regions || null
    return {
      id: r.id,
      council_name: r.council_name,
      state: r.state,
      website: r.website,
      covers: r.covers,
      region: region ? { id: region.id, name: region.name, slug: region.slug, state: region.state, listing_count: region.listing_count } : null,
      region_name: region?.name || r.region_name || null,
      contact_name: r.contact_name,
      contact_role: r.contact_role,
      contact_email: email,
      email_source: r.email_source || null,
      website_status: websiteStatus,
      discovered_at: r.discovered_at || null,
      personal_note: r.personal_note || null,
      funnel_status: r.status || null,
      send_status: sendStatus,
      last_contacted_at: r.last_contacted_at || null,
      suppressed: isSuppressed,
      sendable,
    }
  })

  const counts = {
    total: enriched.length,
    withWebsite: enriched.filter((c) => c.website).length,
    withEmail: enriched.filter((c) => c.contact_email).length,
    suppressed: enriched.filter((c) => c.suppressed).length,
    alreadySent: enriched.filter((c) => UNSENDABLE_STATUSES.has(c.send_status)).length,
    sendable: enriched.filter((c) => c.sendable).length,
  }

  return NextResponse.json({ ok: true, councils: enriched, counts })
}
