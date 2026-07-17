import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

/**
 * POST /api/admin/press-outreach/segment
 * Resolve a press recipient segment for the compose UI, enriched with outreach
 * state (email, suppression, prior send) and the joined region.
 *
 * Body: { kind?, state?, beat?, q?, status?, limit? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const kind = body.kind || null
  const state = body.state || null
  const beat = body.beat ? String(body.beat).trim().toLowerCase() : null
  const q = body.q ? String(body.q).trim() : null
  const funnel = body.status || null
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500)

  const sb = getSupabaseAdmin()

  let query = sb
    .from('press_outreach')
    .select('id, kind, outlet_name, journalist_name, role_title, beat, state, website, region_id, region_name, contact_email, twitter, email_source, discovered_at, personal_note, status, send_status, sent_at, opened_at, campaign_id, last_contacted_at, notes, regions:region_id (id, name, slug, state)')
    .order('outlet_name', { ascending: true })
    .limit(limit)

  if (kind) query = query.eq('kind', kind)
  if (state) query = query.eq('state', state)
  if (beat) query = query.contains('beat', [beat])
  if (funnel) query = query.eq('status', funnel)
  if (q) query = query.or(`outlet_name.ilike.%${q}%,journalist_name.ilike.%${q}%,region_name.ilike.%${q}%`)

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
    const sendable = !!email && !isSuppressed && !UNSENDABLE_STATUSES.has(sendStatus) && r.status !== 'declined'
    // Same semantics as council/operator outreach: when an email is present
    // email_source is provenance; when absent it holds the last check outcome.
    const websiteStatus = email
      ? 'has_email'
      : (r.discovered_at ? (r.email_source || 'no_email') : null)
    const region = r.regions || null
    return {
      id: r.id,
      kind: r.kind,
      outlet_name: r.outlet_name,
      journalist_name: r.journalist_name,
      role_title: r.role_title,
      beat: r.beat || [],
      state: r.state,
      website: r.website,
      twitter: r.twitter,
      region: region ? { id: region.id, name: region.name, slug: region.slug, state: region.state } : null,
      region_name: region?.name || r.region_name || null,
      contact_email: email,
      email_source: r.email_source || null,
      website_status: websiteStatus,
      discovered_at: r.discovered_at || null,
      personal_note: r.personal_note || null,
      funnel_status: r.status || null,
      send_status: sendStatus,
      opened_at: r.opened_at || null,
      last_contacted_at: r.last_contacted_at || null,
      suppressed: isSuppressed,
      sendable,
    }
  })

  const counts = {
    total: enriched.length,
    journalists: enriched.filter((c) => c.kind === 'journalist').length,
    desks: enriched.filter((c) => c.kind === 'desk').length,
    withWebsite: enriched.filter((c) => c.website).length,
    withEmail: enriched.filter((c) => c.contact_email).length,
    suppressed: enriched.filter((c) => c.suppressed).length,
    alreadySent: enriched.filter((c) => UNSENDABLE_STATUSES.has(c.send_status)).length,
    sendable: enriched.filter((c) => c.sendable).length,
  }

  return NextResponse.json({ ok: true, press: enriched, counts })
}
