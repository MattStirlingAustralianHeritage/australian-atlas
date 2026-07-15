import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'
import { persistDiscoveries } from '@/lib/outreach/discoverPersist'

export const dynamic = 'force-dynamic'
// 120s (not the old 60s): a batch is hard-bounded by the per-site cap in
// discoverEmailsBatch (⌈n/concurrency⌉ × perSiteMs ≈ 32s for a 10-site chunk),
// so 120 is generous headroom that absorbs a cold start + DB writes and makes
// a FUNCTION_INVOCATION_TIMEOUT effectively impossible.
export const maxDuration = 120

/**
 * POST /api/admin/outreach/discover
 * Discover contact emails for a set of listings by scraping their websites,
 * and persist the outcome onto operator_outreach (shared with the autopilot
 * cron via lib/outreach/discoverPersist).
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
  // Each site is hard-capped (perSiteMs) so no host can stall the batch; the
  // soft deadline is a secondary backstop kept well inside maxDuration (120s) so
  // we always return JSON — a partial scan the client can re-run, never a
  // serverless-timeout HTML page.
  const discovered = await discoverEmailsBatch(
    withSites.map((l) => ({ id: l.id, website: l.website })),
    6,
    { deadlineMs: 100_000 }
  )
  const timedOut = discovered.length < withSites.length

  const { results, statusCounts, foundCount } = await persistDiscoveries({
    sb, listings: listings || [], discovered,
  })

  return NextResponse.json({
    ok: true,
    statusCounts,
    scanned: discovered.length,
    found: foundCount,
    timedOut,
    results,
  })
}
