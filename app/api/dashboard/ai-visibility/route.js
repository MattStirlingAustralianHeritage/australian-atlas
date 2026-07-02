import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * GET /api/dashboard/ai-visibility?listingId=<uuid>
 *
 * AI Visibility report for a listing the caller OWNS (active claim row; admins
 * bypass) — a paid (Standard-plan) perk. Reads `site_crawler_hits`, the
 * middleware-written log of AI crawler requests, scoped to the listing's
 * portal place page (/place/{slug}, including locale-prefixed variants).
 *
 * Hits split two ways:
 *   live  — live-conversation fetchers (ChatGPT-User, Claude-User,
 *           Perplexity-User): an assistant pulled the page DURING a real
 *           user conversation.
 *   crawl — index/training crawlers (GPTBot, ClaudeBot, PerplexityBot and
 *           everything else logged): background reads that keep assistants'
 *           knowledge of the Atlas current.
 *
 * This is REPORTING ONLY. Nothing here influences search, map, discover or
 * AI-answer ranking — inclusion in AI answers cannot be bought.
 *
 * Response (owner, paid):
 * {
 *   paid: true,
 *   listing: { id, name, slug },
 *   totals: { live_30d, live_prev_30d, crawl_30d, crawl_prev_30d,
 *             all_30d, all_prev_30d },
 *   bots:   [{ bot_name, kind: 'live'|'crawl', hits_30d, hits_prev_30d }],
 *   weekly: [{ week_start: 'YYYY-MM-DD', live, crawl, total }],  // 8 weeks, oldest first
 *   capped: boolean  // row cap hit — totals are a floor, not exact
 * }
 *
 * Response (owner, unpaid): { paid: false, locked: true } — 200, so the
 * dashboard can render the locked state with the right context (same shape
 * of behaviour as /api/dashboard/trail).
 */

// Live-conversation fetchers. Everything else in site_crawler_hits (GPTBot,
// OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Googlebot, …)
// counts as an index/training crawler.
const LIVE_BOTS = new Set(['ChatGPT-User', 'Claude-User', 'Perplexity-User'])

// Same slug discipline as /api/dashboard/stats — kebab-case covers every real
// slug, and a conforming slug can't break the ilike pattern or the boundary
// regex below.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 8
const ROW_CAP = 10000

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

// Zero-filled report skeleton — also what a slug-less listing gets back.
function emptyReport(now) {
  return {
    totals: { live_30d: 0, live_prev_30d: 0, crawl_30d: 0, crawl_prev_30d: 0, all_30d: 0, all_prev_30d: 0 },
    bots: [],
    weekly: Array.from({ length: WEEKS }, (_, i) => ({
      week_start: dayKey(now - (WEEKS - i) * 7 * DAY_MS),
      live: 0,
      crawl: 0,
      total: 0,
    })),
    capped: false,
  }
}

export async function GET(request) {
  // Verify JWT from Authorization header
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor or admin role required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listingId')

  if (!listingId) {
    return NextResponse.json({ error: 'listingId query parameter is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, name, slug')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Visibility data is private to the owner: require an active claim
    // (admins bypass) — same discipline as /api/dashboard/stats.
    if (user.role !== 'admin') {
      const { data: claim } = await sb
        .from('listing_claims')
        .select('id')
        .eq('listing_id', listingId)
        .eq('claimed_by', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!claim) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
    }

    // Paid gate: the AI Visibility report is a Standard-plan feature. Owners on
    // a free claim get a lock marker (not an error) so the dashboard can render
    // the tasteful locked state. Admins bypass for support.
    const paid = await isListingPaid(sb, listingId)
    if (!paid && user.role !== 'admin') {
      return NextResponse.json({ paid: false, locked: true })
    }

    const now = Date.now()
    const thirtyDaysAgoMs = now - 30 * DAY_MS
    const sixtyDaysAgoMs = now - 60 * DAY_MS
    const firstWeekStartMs = now - WEEKS * 7 * DAY_MS

    const report = emptyReport(now)

    // A listing without a well-formed slug has no /place page for crawlers to
    // hit — return the zeroed report rather than risk a malformed filter.
    if (listing.slug && SAFE_SLUG.test(listing.slug)) {
      const { data: rows, error: hitsErr } = await sb
        .from('site_crawler_hits')
        .select('bot_name, path, fetched_at')
        .ilike('path', `%/place/${listing.slug}%`)
        .gte('fetched_at', new Date(sixtyDaysAgoMs).toISOString())
        .order('fetched_at', { ascending: false })
        .limit(ROW_CAP)
      if (hitsErr) throw hitsErr

      // The ilike is a coarse prefix match — '%/place/foo%' also catches
      // /place/foo-bar. Only count paths where the slug ends at a boundary.
      const exact = new RegExp(`/place/${listing.slug}(?:[/?#]|$)`, 'i')

      const botTotals = new Map() // bot_name -> { hits_30d, hits_prev_30d }
      for (const row of rows || []) {
        if (!row.bot_name || !exact.test(row.path || '')) continue
        const t = Date.parse(row.fetched_at)
        if (!Number.isFinite(t) || t < sixtyDaysAgoMs) continue

        const isLive = LIVE_BOTS.has(row.bot_name)
        const isCurrent = t >= thirtyDaysAgoMs

        const bot = botTotals.get(row.bot_name) || { hits_30d: 0, hits_prev_30d: 0 }
        if (isCurrent) bot.hits_30d += 1
        else bot.hits_prev_30d += 1
        botTotals.set(row.bot_name, bot)

        if (isLive) {
          if (isCurrent) report.totals.live_30d += 1
          else report.totals.live_prev_30d += 1
        } else {
          if (isCurrent) report.totals.crawl_30d += 1
          else report.totals.crawl_prev_30d += 1
        }

        // Weekly trend — 8 aligned 7-day buckets ending now.
        const idx = Math.floor((t - firstWeekStartMs) / (7 * DAY_MS))
        if (idx >= 0 && idx < WEEKS) {
          const bucket = report.weekly[idx]
          bucket.total += 1
          if (isLive) bucket.live += 1
          else bucket.crawl += 1
        }
      }

      report.totals.all_30d = report.totals.live_30d + report.totals.crawl_30d
      report.totals.all_prev_30d = report.totals.live_prev_30d + report.totals.crawl_prev_30d
      report.bots = [...botTotals.entries()]
        .map(([bot_name, counts]) => ({
          bot_name,
          kind: LIVE_BOTS.has(bot_name) ? 'live' : 'crawl',
          hits_30d: counts.hits_30d,
          hits_prev_30d: counts.hits_prev_30d,
        }))
        .sort((a, b) => b.hits_30d - a.hits_30d || b.hits_prev_30d - a.hits_prev_30d)
      report.capped = (rows || []).length >= ROW_CAP
    }

    return NextResponse.json({
      paid: true,
      listing: { id: listing.id, name: listing.name, slug: listing.slug },
      ...report,
    })
  } catch (err) {
    console.error('[dashboard/ai-visibility] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch AI visibility' }, { status: 500 })
  }
}
