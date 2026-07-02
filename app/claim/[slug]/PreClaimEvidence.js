import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * Pre-claim evidence panel — a venue's OWN last-30-days organic traction,
 * computed server-side and shown ABOVE the tier choice on /claim/[slug].
 *
 * Sources and filters mirror the operator dashboard and the operator digest
 * (app/api/cron/operator-digest/route.js) so this never disagrees with what
 * an operator later sees inside the dashboard:
 *   - human page views   → pageviews (is_bot=false), path ilike '%/place/<slug>%'
 *   - search appearances → listing_search_appearances by listing_id
 *   - saves              → user_saves by listing_id
 *   - AI activity        → site_crawler_hits path match, split into live
 *     conversation fetchers (ChatGPT-User/Claude-User/Perplexity-User) vs
 *     index/training crawler fetches
 *
 * REPORTING ONLY — nothing here reads into or influences search/map/discover
 * ranking or any visitor-facing ordering. A tile renders only when its count
 * is > 0; if every count is zero the whole panel renders nothing.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const ROW_CAP = 10000

// Live-conversation fetchers — an assistant pulled the page DURING a real user
// conversation. Everything else logged in site_crawler_hits counts as an
// index/training crawler. Mirrors /api/cron/operator-digest.
const LIVE_BOTS = new Set(['ChatGPT-User', 'Claude-User', 'Perplexity-User'])

// Same slug discipline as /api/dashboard/stats — kebab-case covers every real
// slug, and a conforming slug can't break the ilike pattern or the boundary
// regex below.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

// Last 30 days of this listing's own organic activity. Shapes are lifted from
// computeListingMetrics() in the operator digest cron.
async function computeEvidenceUncached(listingId, slug) {
  const sb = getSupabaseAdmin()
  const nowMs = Date.now()
  const thirtyAgoMs = nowMs - 30 * DAY_MS
  const thirtyAgoIso = new Date(thirtyAgoMs).toISOString()

  const evidence = { views: 0, search_appearances: 0, saves: 0, ai_live: 0, ai_crawl: 0 }

  // A listing without a well-formed slug has no /place page to match — its
  // pageview/AI numbers stay zero rather than risking a malformed filter.
  const slugOk = !!(slug && SAFE_SLUG.test(slug))
  // The ilike is a coarse match — '%/place/foo%' also catches /place/foo-bar.
  // Only count paths where the slug ends at a boundary.
  const exact = slugOk ? new RegExp(`/place/${slug}(?:[/?#]|$)`, 'i') : null

  const [pvRes, hitRes, saRes, svRes] = await Promise.all([
    slugOk
      ? sb.from('pageviews')
          .select('path')
          .ilike('path', `%/place/${slug}%`)
          .not('is_bot', 'is', true)
          .gte('ts', thirtyAgoIso)
          .order('ts', { ascending: false })
          .limit(ROW_CAP)
      : Promise.resolve({ data: [], error: null }),
    slugOk
      ? sb.from('site_crawler_hits')
          .select('bot_name, path')
          .ilike('path', `%/place/${slug}%`)
          .gte('fetched_at', thirtyAgoIso)
          .order('fetched_at', { ascending: false })
          .limit(ROW_CAP)
      : Promise.resolve({ data: [], error: null }),
    sb.from('listing_search_appearances')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .gte('appeared_at', thirtyAgoIso),
    sb.from('user_saves')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .gte('saved_at', thirtyAgoIso),
  ])

  for (const r of [pvRes, hitRes, saRes, svRes]) {
    if (r.error) throw r.error
  }

  for (const row of pvRes.data || []) {
    if (exact && !exact.test(row.path || '')) continue
    evidence.views += 1
  }

  for (const row of hitRes.data || []) {
    if (exact && !exact.test(row.path || '')) continue
    if (!row.bot_name) continue
    if (LIVE_BOTS.has(row.bot_name)) evidence.ai_live += 1
    else evidence.ai_crawl += 1
  }

  evidence.search_appearances = saRes.count || 0
  evidence.saves = svRes.count || 0

  return evidence
}

// Cached per listing id for 6 hours — same unstable_cache pattern as
// app/atlas-index/page.js. The slug rides along in the closure; the cache key
// is the listing id so a slug rename can't split the cache.
async function getEvidence(listingId, slug) {
  const cached = unstable_cache(
    () => computeEvidenceUncached(listingId, slug),
    ['pre-claim-evidence', listingId],
    { revalidate: 21600 }
  )
  try {
    return await cached()
  } catch (err) {
    console.error('[pre-claim-evidence] compute failed:', err.message)
    return null
  }
}

// ── Presentation ──────────────────────────────────────────────

function Tile({ value, label }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '28px',
          lineHeight: 1.1,
          color: 'var(--color-ink)',
        }}
      >
        {value.toLocaleString()}
      </div>
      <div
        className="mt-1"
        style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 300, color: 'var(--color-muted)' }}
      >
        {label}
      </div>
    </div>
  )
}

export default async function PreClaimEvidence({ listingId, listingName, slug }) {
  const evidence = await getEvidence(listingId, slug)
  if (!evidence) return null

  // One tile per non-zero signal — never a wall of zeros. Live and crawler AI
  // activity are separate lines.
  const tiles = []
  if (evidence.views > 0) tiles.push({ value: evidence.views, label: 'Human page views' })
  if (evidence.search_appearances > 0) tiles.push({ value: evidence.search_appearances, label: 'Search appearances' })
  if (evidence.saves > 0) tiles.push({ value: evidence.saves, label: 'Saved by visitors' })
  if (evidence.ai_live > 0) tiles.push({ value: evidence.ai_live, label: 'AI assistant look-ups' })
  if (evidence.ai_crawl > 0) tiles.push({ value: evidence.ai_crawl, label: 'AI crawler fetches' })

  // Nothing organic yet — render nothing rather than an empty shell.
  if (tiles.length === 0) return null

  return (
    <div className="mb-10">
      <h2
        className="mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '18px',
          color: 'var(--color-ink)',
        }}
      >
        What happened around {listingName} on the Atlas — last 30 days
      </h2>
      <p
        className="mb-4"
        style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)' }}
      >
        Counted before you&apos;ve told us anything — this is organic activity on your Atlas page.
      </p>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))` }}
      >
        {tiles.map((t) => (
          <Tile key={t.label} value={t.value} label={t.label} />
        ))}
      </div>
    </div>
  )
}
