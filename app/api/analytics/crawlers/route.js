import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { BOT_CATALOGUE, BOT_CATEGORIES } from '@/lib/bots/registry'
import { locales } from '@/lib/i18n/config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/crawlers
 *
 * Bot and AI-crawler intelligence for /admin/analytics.
 *
 * Every figure is aggregated in Postgres by the functions in
 * supabase/migrations/272 + 273. Nothing is counted in JS: site_crawler_hits
 * is ~182k rows and PostgREST caps a select at 1000, so any client-side
 * aggregation would silently report on a sliver of the window — the same
 * failure mode that produced the "Total Pageviews stuck at 1000" bug in
 * lib/analytics/aggregate.js.
 *
 * Query params:
 *   range - '24h' | '7d' | '30d' | '90d' | '1y'   (default '30d')
 *   bot   - restrict top paths + the trend line to one bot_name (optional)
 */
const RANGE_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
// Bucket granularity per range. Crawl behaviour is bursty, so short windows
// stay hourly; long ones collapse so the trend does not turn into noise.
const RANGE_BUCKET = { '24h': 'hour', '7d': 'hour', '30d': 'day', '90d': 'week', '1y': 'month' }

// The nine tokens migration 156 could match. Anything outside this set can only
// have been recorded after the catalogue-based detection shipped, which is what
// makes the "not seen" list below honest rather than alarming.
const LEGACY_TOKENS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
  'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Googlebot',
]

const first = (res) => (Array.isArray(res?.data) ? res.data[0] || null : res?.data || null)
const rows = (res) => (Array.isArray(res?.data) ? res.data : [])

export async function GET(request) {
  if (!(await checkAdmin(await cookies()))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const range = RANGE_DAYS[searchParams.get('range')] ? searchParams.get('range') : '30d'
  const bot = searchParams.get('bot') || null

  const days = RANGE_DAYS[range]
  const bucket = RANGE_BUCKET[range]
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  try {
    const t0 = Date.now()
    const [
      overviewRes, byBotRes, byCategoryRes, byOperatorRes, timelineRes,
      pathKindsRes, topPathsRes, localeWasteRes, violationsRes, topIpsRes,
      coverageRes, topListingsRes, recentRes, hourlyRes, botTimelineRes, widenedRes,
    ] = await Promise.all([
      sb.rpc('crawler_overview', { p_since: since }),
      sb.rpc('crawler_by_bot', { p_since: since }),
      sb.rpc('crawler_by_category', { p_since: since }),
      sb.rpc('crawler_by_operator', { p_since: since }),
      sb.rpc('crawler_timeline', { p_since: since, p_bucket: bucket }),
      sb.rpc('crawler_path_kinds', { p_since: since }),
      sb.rpc('crawler_top_paths', { p_since: since, p_limit: 30, p_category: null, p_bot: bot }),
      sb.rpc('crawler_locale_waste', { p_since: since }),
      sb.rpc('crawler_robots_violations', { p_since: since }),
      sb.rpc('crawler_top_ips', { p_since: since, p_limit: 15 }),
      sb.rpc('crawler_ai_coverage', { p_since: since }),
      sb.rpc('crawler_top_listings', { p_since: since, p_limit: 20 }),
      sb.rpc('crawler_recent', { p_limit: 60 }),
      sb.rpc('crawler_hourly', { p_since: since }),
      bot
        ? sb.rpc('crawler_bot_timeline', { p_since: since, p_bucket: bucket, p_bot: bot })
        : Promise.resolve({ data: [] }),
      // When did widened detection start observing? The first hit from a bot
      // outside the original nine tokens. Null until the new code has deployed.
      // Values are double-quoted: PostgREST's in-list treats bare hyphens and
      // commas as syntax, so `OAI-SearchBot` must be quoted to match literally.
      sb.from('site_crawler_hits')
        .select('fetched_at')
        .not('bot_name', 'in', `(${LEGACY_TOKENS.map((t) => `"${t}"`).join(',')})`)
        .order('fetched_at', { ascending: true })
        .limit(1),
    ])

    const errors = Object.entries({
      overview: overviewRes, byBot: byBotRes, byCategory: byCategoryRes,
      byOperator: byOperatorRes, timeline: timelineRes, pathKinds: pathKindsRes,
      topPaths: topPathsRes, localeWaste: localeWasteRes, violations: violationsRes,
      topIps: topIpsRes, coverage: coverageRes, topListings: topListingsRes,
      recent: recentRes, hourly: hourlyRes,
    })
      .filter(([, res]) => res?.error)
      .map(([key, res]) => `${key}: ${res.error.message}`)
    if (errors.length) throw new Error(errors.join(' | '))

    const byBot = rows(byBotRes)
    const seen = new Set(byBot.map((b) => b.bot_name))

    // Catalogue entries with no hits in this window. For an AI search or
    // assistant crawler that absence is the finding: if Applebot has never
    // fetched the site, Siri and Apple Intelligence cannot cite it.
    const notSeen = BOT_CATALOGUE
      .filter((b) => !seen.has(b.name))
      .map((b) => ({
        name: b.name, operator: b.operator, category: b.category, purpose: b.purpose,
      }))

    const detectionWidenedAt = rows(widenedRes)[0]?.fetched_at || null

    const payload = {
      range,
      bucketUnit: bucket,
      since,
      bot,
      overview: first(overviewRes) || {},
      coverage: first(coverageRes) || {},
      byBot,
      byCategory: rows(byCategoryRes),
      byOperator: rows(byOperatorRes),
      timeline: rows(timelineRes),
      botTimeline: rows(botTimelineRes),
      pathKinds: rows(pathKindsRes),
      topPaths: rows(topPathsRes),
      localeWaste: rows(localeWasteRes),
      violations: rows(violationsRes),
      topIps: rows(topIpsRes),
      topListings: rows(topListingsRes),
      recent: rows(recentRes),
      hourly: rows(hourlyRes),
      notSeen,
      // The dashboard needs labels/colours/blurbs for whatever categories come
      // back; shipping them with the payload keeps the client free of a second
      // copy of the taxonomy.
      categories: BOT_CATEGORIES,
      catalogueSize: BOT_CATALOGUE.length,
      detectionWidenedAt,
      // The portal serves /ko and /zh via a middleware rewrite and advertises
      // them in hreflang, so crawls of those prefixes are wanted traffic, not
      // waste. Sent from lib/i18n/config so the dashboard can never disagree
      // with what middleware.js actually serves.
      supportedLocales: locales,
    }

    console.log(JSON.stringify({
      event: 'analytics_crawlers',
      range, bot, since,
      totalHits: payload.overview.total_hits ?? 0,
      aiHits: payload.overview.ai_hits ?? 0,
      bots: byBot.length,
      ms: Date.now() - t0,
    }))

    return NextResponse.json(payload)
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_crawlers_error', range, bot, error: err.message }))
    return NextResponse.json({
      range, bucketUnit: bucket, since, bot,
      overview: {}, coverage: {}, byBot: [], byCategory: [], byOperator: [],
      timeline: [], botTimeline: [], pathKinds: [], topPaths: [], localeWaste: [],
      violations: [], topIps: [], topListings: [], recent: [], hourly: [], notSeen: [],
      categories: BOT_CATEGORIES, catalogueSize: BOT_CATALOGUE.length,
      detectionWidenedAt: null, supportedLocales: locales,
      error: 'Crawler analytics unavailable',
    }, { status: 200 })
  }
}
