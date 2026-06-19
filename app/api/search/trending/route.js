import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Obvious non-discovery noise (QA probes etc.) that should never surface as a
// "trending search" suggestion.
const DENY = new Set(['test', 'verify', 'probe', 'asdf', 'asdfghj', 'example'])

// Trailing words that mark a mid-typing fragment ("brewery in", "places near").
const TRAILING_STOP = new Set(['in', 'the', 'a', 'an', 'of', 'at', 'near', 'with', 'and', 'to', 'for', 'on', 'by', 'from', 'that', 'are'])

// Keep only queries that read as a deliberate search, not a half-typed fragment:
// not a QA probe, not ending in a stopword, and either multi-word or a
// reasonably-long single word (drops "furn", "fern", "shop").
function looksDeliberate(key) {
  if (key.length < 3 || key.length > 40 || DENY.has(key)) return false
  const words = key.split(/\s+/)
  if (TRAILING_STOP.has(words[words.length - 1])) return false
  return words.length >= 2 || key.length >= 6
}

/**
 * GET /api/search/trending — the most-repeated non-zero-result queries from the
 * last 30 days, as discovery chips. Aggregated in JS (PostgREST has no GROUP BY).
 * Cached at the edge for 10 min; failure returns an empty list (never breaks the page).
 */
export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await sb
      .from('search_events')
      .select('query_text')
      .eq('zero_result', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)

    const counts = new Map()
    for (const r of (data || [])) {
      const label = (r.query_text || '').trim()
      const key = label.toLowerCase()
      if (!looksDeliberate(key)) continue
      const cur = counts.get(key)
      if (cur) cur.n++
      else counts.set(key, { label, n: 1 })
    }
    // Require ≥2 occurrences so one-off probes/searches don't appear.
    const trending = [...counts.values()]
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((x) => x.label)

    return NextResponse.json({ trending }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch {
    return NextResponse.json({ trending: [] })
  }
}
