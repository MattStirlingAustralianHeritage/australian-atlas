import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT, getListingRegion } from '@/lib/regions'

export const dynamic = 'force-dynamic'

const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

/**
 * POST /api/admin/outreach/segment
 * Resolve a recipient segment for the compose UI and enrich each listing with
 * its outreach state (known email, suppression, prior send).
 *
 * Body: { vertical?, state?, minQuality?, region?, limit? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const vertical = body.vertical || null
  const state = body.state || null
  const minQuality = Number(body.minQuality) || 0
  const region = body.region ? String(body.region).toLowerCase() : null
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500)

  const sb = getSupabaseAdmin()

  let query = sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, website, phone, quality_score, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .eq('is_claimed', false)
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (vertical) query = query.eq('vertical', vertical)
  if (state) query = query.eq('state', state)
  if (minQuality > 0) query = query.gte('quality_score', minQuality)

  const { data: listings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = listings || []
  if (region) {
    rows = rows.filter((l) => (getListingRegion(l)?.name || l.region || '').toLowerCase().includes(region))
  }

  const ids = rows.map((l) => l.id)

  // Outreach state for these listings.
  const outreachByListing = new Map()
  if (ids.length) {
    const { data: orows } = await sb
      .from('operator_outreach')
      .select('listing_id, contact_email, email_source, send_status, status, last_contacted_at')
      .in('listing_id', ids)
    for (const r of orows || []) outreachByListing.set(r.listing_id, r)
  }

  // Suppression set for the emails we know about.
  const emails = [...outreachByListing.values()].map((r) => r.contact_email).filter(Boolean)
  const suppressed = new Set()
  if (emails.length) {
    const lowered = [...new Set(emails.map((e) => e.toLowerCase()))]
    const { data: srows } = await sb
      .from('outreach_suppressions')
      .select('email')
      .in('email', lowered)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  const enriched = rows.map((l) => {
    const o = outreachByListing.get(l.id)
    const email = o?.contact_email || null
    const isSuppressed = email ? suppressed.has(email.toLowerCase()) : false
    const sendStatus = o?.send_status || null
    const sendable = !!email && !isSuppressed && !UNSENDABLE_STATUSES.has(sendStatus)
    return {
      id: l.id,
      name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      region: getListingRegion(l)?.name || l.region || null,
      state: l.state,
      website: l.website || null,
      quality_score: l.quality_score,
      contact_email: email,
      email_source: o?.email_source || null,
      send_status: sendStatus,
      funnel_status: o?.status || null,
      last_contacted_at: o?.last_contacted_at || null,
      suppressed: isSuppressed,
      sendable,
    }
  })

  const counts = {
    total: enriched.length,
    withWebsite: enriched.filter((l) => l.website).length,
    withEmail: enriched.filter((l) => l.contact_email).length,
    suppressed: enriched.filter((l) => l.suppressed).length,
    alreadySent: enriched.filter((l) => UNSENDABLE_STATUSES.has(l.send_status)).length,
    sendable: enriched.filter((l) => l.sendable).length,
  }

  return NextResponse.json({ ok: true, listings: enriched, counts })
}
