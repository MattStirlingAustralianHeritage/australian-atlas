import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { excludeNeedsReview, excludeTestListings } from '@/lib/listings/publicFilter'
import IndexClient from './IndexClient'

// The root layout's auth/i18n reads keep every route dynamic, so `revalidate`
// alone can't make this page static — the win lives in the Data Cache below:
// the ~6.9k-row directory leaves the database at most once an hour and every
// request in between renders from the cached copy.
export const revalidate = 3600

// Kept in sync with lib/listings/publicFilter.js (excludeTestListings) — the
// value is passed to the RPC so the SQL filter matches the JS fallback exactly.
const TEST_SLUG_PREFIX = 'admin'

// ── Data fetching ────────────────────────────────────────────

// Fallback — only runs if the atlas_index_rows RPC is unavailable (fresh DB /
// cold PostgREST schema cache). Paginates ordered by id so pages can't overlap
// or skip rows, then restores the A–Z display order in JS.
async function fetchIndexFallback(sb, publicVerticals) {
  const PAGE_SIZE = 1000
  let all = []
  let page = 0
  while (true) {
    let query = sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, region')
      .eq('status', 'active')
      .in('vertical', publicVerticals)
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    query = excludeNeedsReview(excludeTestListings(query))
    const { data, error } = await query
    if (error) {
      console.error(`[atlas-index] fallback page ${page} error:`, error.message)
      break
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

// Fast path: one round trip. atlas_index_rows() applies the public-surface
// filter (status/vertical/needs_review/test-slug) and returns every matching
// listing name-ordered in a single JSON scalar — see
// supabase/migrations/203_atlas_index_rpc.sql. The old per-request path
// (~7 sequential PostgREST round-trips, force-dynamic) measured 5.7–8.5s
// TTFB on prod.
async function fetchIndexRowsUncached(publicVerticals) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.rpc('atlas_index_rows', {
    p_verticals: publicVerticals,
    p_test_prefix: TEST_SLUG_PREFIX,
  })
  if (error) {
    console.error('[atlas-index] atlas_index_rows RPC failed, falling back to pagination:', error.message)
    return fetchIndexFallback(sb, publicVerticals)
  }
  return Array.isArray(data) ? data : []
}

const fetchIndexRowsCached = unstable_cache(
  async (publicVerticals) => {
    const rows = await fetchIndexRowsUncached(publicVerticals)
    // A transient DB/network failure must not poison the hour-long cache
    // with an empty directory (observed in dev: a raced "fetch failed"
    // cached [] and every later request rendered "Browse all 0"). Throwing
    // skips the cache write; the catch below serves this request uncached
    // and the next request retries the cache fill.
    if (rows.length === 0) throw new Error('empty result — refusing to cache')
    return rows
  },
  ['atlas-index-rows'],
  { revalidate: 3600 }
)

const getAllListings = cache(async () => {
  const publicVerticals = getPublicVerticals()
  try {
    return await fetchIndexRowsCached(publicVerticals)
  } catch (err) {
    console.error('[atlas-index] cached fetch failed, serving uncached:', err.message)
    return fetchIndexRowsUncached(publicVerticals)
  }
})

// ── Metadata ────────────────────────────────────────────────

export async function generateMetadata() {
  const listings = await getAllListings()
  const count = listings.length.toLocaleString()
  return {
    title: 'Atlas Index — Every Independent Place in Australia',
    description: `Browse all ${count} independent Australian places alphabetically. The complete A-Z directory of the Australian Atlas network.`,
    openGraph: {
      title: 'Atlas Index — Every Independent Place in Australia',
      description: `Browse all ${count} independent Australian places alphabetically.`,
    },
  }
}

// ── Page ─────────────────────────────────────────────────────

export default async function AtlasIndexPage() {
  const listings = await getAllListings()
  const publicVerticals = getPublicVerticals()
  return <IndexClient listings={listings} totalCount={listings.length} publicVerticals={publicVerticals} />
}
