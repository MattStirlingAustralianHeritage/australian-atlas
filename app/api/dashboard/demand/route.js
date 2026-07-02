import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * GET /api/dashboard/demand?listingId=<uuid>
 *
 * Search-demand intelligence for a listing the caller OWNS (active claim row;
 * admins bypass) — a paid (Standard-plan) perk. Three honest, DB-grounded
 * blocks, nothing invented:
 *
 *  (a) "Queries you appeared for" — search_result_impressions (migration 205,
 *      began logging this week, so data is SPARSE) for this listing, last 30
 *      days: top 15 query texts with appearance count and best (lowest)
 *      1-based position. Grouped in JS from the newest <= 5000 rows.
 *  (b) "Unmet searches on the Atlas" — NETWORK-WIDE search_events with
 *      zero_result=true, last 30 days, deduped by query text, newest first,
 *      capped at 10. Not listing-specific; the client must label it as such.
 *  (c) Keyword hints — the listing's current search_keywords plus up to 8
 *      suggestions: frequent significant words from (a)'s queries not already
 *      present in the listing's name/description/keywords (basic stopword
 *      filter, lowercase, min length 4).
 *
 * This is REPORTING ONLY, private to the owner. Nothing here reads into or
 * influences search, map or discover ranking, or any visitor-facing ordering.
 * (search_keywords themselves are recall-only: they help a listing MATCH
 * relevant searches, never outrank anyone — see migration 161.)
 *
 * Response (owner, paid):
 * {
 *   paid: true,
 *   listing: { id, name },
 *   window_days: 30,
 *   appeared: {
 *     total_impressions,        // rows fetched (floor if capped)
 *     capped,                   // true when the 5000-row fetch cap was hit
 *     distinct_queries,
 *     queries: [{ query, count, best_position, last_seen }]   // top 15
 *   },
 *   unmet: [{ query, count, last_seen }],                     // <= 10, network-wide
 *   keywords: { current: [...], suggestions: [{ word, count }] }
 * }
 *
 * Response (owner, unpaid): { paid: false, locked: true } — 200, so the
 * dashboard can render the locked state (same behaviour as
 * /api/dashboard/benchmarks and /api/dashboard/ai-visibility).
 */

// Newest-first fetch caps. Impressions at 5000 (per-listing 30-day volume sits
// far below this today — the table is a week old); zero-result events at 500,
// plenty to surface 10 distinct recent queries.
const IMPRESSIONS_FETCH_CAP = 5000
const UNMET_FETCH_CAP = 500

const TOP_QUERIES = 15
const UNMET_CAP = 10
const SUGGESTION_CAP = 8
const MIN_SUGGESTION_LENGTH = 4

// Basic stopword filter for keyword hints: common English filler plus
// search-phrasing words ("best cafe near me") and platform words that would
// make useless keywords. Anything shorter than MIN_SUGGESTION_LENGTH never
// reaches this set.
const STOPWORDS = new Set([
  'that', 'this', 'from', 'have', 'what', 'where', 'when', 'which', 'with',
  'your', 'yours', 'their', 'them', 'they', 'then', 'than', 'there', 'here',
  'will', 'would', 'could', 'should', 'about', 'after', 'before', 'between',
  'into', 'onto', 'over', 'other', 'also', 'very', 'really', 'please',
  'best', 'good', 'great', 'nice', 'near', 'nearby', 'around', 'close',
  'find', 'looking', 'want', 'need', 'show', 'give', 'recommend',
  'recommendation', 'recommendations', 'suggestion', 'suggestions',
  'place', 'places', 'spot', 'spots', 'venue', 'venues', 'somewhere',
  'something', 'anything', 'things', 'thing', 'some', 'more', 'most',
  'only', 'just', 'like', 'open', 'today', 'tonight', 'weekend', 'visit',
  'local', 'area', 'town', 'city', 'australia', 'australian', 'atlas',
  'listing', 'listings', 'shop', 'shops', 'store', 'stores',
])

// Collapse whitespace; empty string for anything unusable.
function normQuery(text) {
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
}

// Significant words from a query: lowercase, letters (plus internal
// apostrophes/hyphens), min length 4, stopwords out.
function significantWords(query) {
  const words = (query || '').toLowerCase().match(/[a-z][a-z'’-]{3,}/g) || []
  return words.filter(w => w.length >= MIN_SUGGESTION_LENGTH && !STOPWORDS.has(w))
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
      .select('id, name, description, search_keywords')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Demand data is private to the owner: require an active claim (admins
    // bypass) — same discipline as /api/dashboard/stats.
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

    // Paid gate: search demand is a Standard-plan feature. Owners on a free
    // claim get a lock marker (not an error) so the dashboard can render the
    // locked state. Admins bypass for support.
    const paid = await isListingPaid(sb, listingId)
    if (!paid && user.role !== 'admin') {
      return NextResponse.json({ paid: false, locked: true })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [impressionsRes, unmetRes] = await Promise.all([
      // (a) this listing's result impressions, newest first, capped.
      sb
        .from('search_result_impressions')
        .select('query_text, position, created_at')
        .eq('listing_id', listingId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(IMPRESSIONS_FETCH_CAP),

      // (b) network-wide zero-result searches, newest first.
      sb
        .from('search_events')
        .select('query_text, created_at')
        .eq('zero_result', true)
        .not('query_text', 'is', null)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(UNMET_FETCH_CAP),
    ])
    if (impressionsRes.error) throw impressionsRes.error
    if (unmetRes.error) throw unmetRes.error

    const impressionRows = impressionsRes.data || []

    // ── (a) group impressions by query text (case-insensitive) ──────────────
    // Rows arrive newest-first, so the first variant seen per key is the most
    // recent raw text — that's what we display.
    const groups = new Map()
    for (const row of impressionRows) {
      const display = normQuery(row.query_text)
      if (!display) continue
      const key = display.toLowerCase()
      let g = groups.get(key)
      if (!g) {
        g = { query: display, count: 0, best_position: Infinity, last_seen: row.created_at }
        groups.set(key, g)
      }
      g.count += 1
      if (Number.isFinite(row.position) && row.position < g.best_position) {
        g.best_position = row.position
      }
    }
    const queries = [...groups.values()]
      .sort((a, b) => b.count - a.count || a.best_position - b.best_position)
      .slice(0, TOP_QUERIES)
      .map(g => ({
        query: g.query,
        count: g.count,
        best_position: Number.isFinite(g.best_position) ? g.best_position : null,
        last_seen: g.last_seen,
      }))

    // ── (b) dedup unmet searches, keeping recency order ─────────────────────
    const unmetMap = new Map()
    for (const row of unmetRes.data || []) {
      const display = normQuery(row.query_text)
      if (!display) continue
      const key = display.toLowerCase()
      const u = unmetMap.get(key)
      if (u) u.count += 1
      else unmetMap.set(key, { query: display, count: 1, last_seen: row.created_at })
    }
    const unmet = [...unmetMap.values()].slice(0, UNMET_CAP)

    // ── (c) keyword hints from (a)'s queries ────────────────────────────────
    // A candidate word is suggested only if it does NOT already appear in the
    // listing's name, description or current keywords. Substring test against
    // the combined blob deliberately errs toward FEWER suggestions ("cheese"
    // is suppressed by "cheeses") — better quiet than redundant.
    const currentKeywords = Array.isArray(listing.search_keywords)
      ? listing.search_keywords.filter(k => typeof k === 'string' && k.trim())
      : []
    const blob = [listing.name, listing.description, ...currentKeywords]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const freq = new Map()
    for (const row of impressionRows) {
      const seen = new Set() // count each word once per impression row
      for (const w of significantWords(row.query_text)) {
        if (seen.has(w) || blob.includes(w)) continue
        seen.add(w)
        freq.set(w, (freq.get(w) || 0) + 1)
      }
    }
    const suggestions = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SUGGESTION_CAP)
      .map(([word, count]) => ({ word, count }))

    return NextResponse.json({
      paid: true,
      listing: { id: listing.id, name: listing.name },
      window_days: 30,
      appeared: {
        total_impressions: impressionRows.length,
        capped: impressionRows.length >= IMPRESSIONS_FETCH_CAP,
        distinct_queries: groups.size,
        queries,
      },
      unmet,
      keywords: { current: currentKeywords, suggestions },
    })
  } catch (err) {
    console.error('[dashboard/demand] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch search demand' }, { status: 500 })
  }
}
