import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/outreach/discover
 * Discover contact emails for a set of listings by scraping their websites,
 * and persist any found address onto operator_outreach.
 *
 * Body: { listing_ids: string[] }   (max 30 per call — keep the function fast)
 * Returns: { results: [{ listing_id, name, website, email, candidates, source, saved }] }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const listingIds = Array.isArray(body.listing_ids) ? body.listing_ids.slice(0, 30) : []
  if (listingIds.length === 0) {
    return NextResponse.json({ error: 'listing_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Pull the listings + any website we can crawl.
  const { data: listings, error: lErr } = await sb
    .from('listings')
    .select('id, name, website')
    .in('id', listingIds)

  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  const withSites = (listings || []).filter((l) => l.website)
  // Soft deadline well inside maxDuration (60s) so we always return JSON — a
  // partial scan the client can re-run, never a serverless-timeout HTML page.
  const discovered = await discoverEmailsBatch(
    withSites.map((l) => ({ id: l.id, website: l.website })),
    6,
    { deadlineMs: 45_000 }
  )
  const emailByListing = new Map(discovered.map((d) => [d.id, d]))
  const timedOut = discovered.length < withSites.length

  // Existing outreach rows for these listings (there's no unique constraint on
  // listing_id, so we read-then-write to avoid duplicates).
  const { data: existingRows } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, status')
    .in('listing_id', listingIds)
  const existingByListing = new Map((existingRows || []).map((r) => [r.listing_id, r]))

  const now = new Date().toISOString()
  const results = []
  const toInsert = []

  for (const listing of listings || []) {
    const d = emailByListing.get(listing.id)
    const email = d?.email || null
    const existing = existingByListing.get(listing.id)
    let saved = false

    if (email) {
      if (existing) {
        // Only overwrite if we don't already have a (possibly hand-entered)
        // email — never clobber a manually-set address.
        if (!existing.contact_email) {
          const { error } = await sb
            .from('operator_outreach')
            .update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now })
            .eq('id', existing.id)
          saved = !error
        }
      } else {
        toInsert.push({
          listing_id: listing.id,
          contact_email: email,
          email_source: 'website',
          status: 'not_contacted',
          discovered_at: now,
          created_at: now,
          updated_at: now,
        })
        saved = true
      }
    }

    results.push({
      listing_id: listing.id,
      name: listing.name,
      website: listing.website || null,
      email,
      candidates: d?.candidates || [],
      source: d?.source || null,
      saved,
    })
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await sb.from('operator_outreach').insert(toInsert)
    if (insErr) console.error('[outreach/discover] insert error:', insErr.message)
  }

  const foundCount = results.filter((r) => r.email).length
  return NextResponse.json({
    ok: true,
    scanned: discovered.length,
    found: foundCount,
    timedOut,
    results,
  })
}
