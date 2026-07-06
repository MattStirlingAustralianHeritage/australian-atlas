import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { localizePath, splitLocale, PREFIXED_LOCALES } from '@/lib/i18n/config'

export const revalidate = 3600

const SITE_URL = 'https://www.australianatlas.com.au'
const PAGE_SIZE = 1000

// Attach hreflang alternates to a sitemap entry. Every English URL gains a
// sibling for each prefixed locale (/ko, /zh, …); the visible URL stays the
// English one.
function withAlternates(entry) {
  const path = entry.url.startsWith(SITE_URL) ? entry.url.slice(SITE_URL.length) || '/' : entry.url
  // Normalise any locale prefix back to the base path first, so an already-
  // prefixed entry (e.g. the /ko home) isn't double-prefixed into /ko/ko.
  const base = splitLocale(path).basePath
  const languages = { en: `${SITE_URL}${localizePath(base, 'en')}` }
  for (const loc of PREFIXED_LOCALES) {
    languages[loc] = `${SITE_URL}${localizePath(base, loc)}`
  }
  return { ...entry, alternates: { languages } }
}

/**
 * Fetch all rows from a table in batches to handle >1000 records.
 * Supabase caps .select() at 1000 rows by default.
 */
async function fetchAllPaginated(supabase, table, select, filters = []) {
  const all = []
  let from = 0

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
    for (const [method, ...args] of filters) {
      query = query[method](...args)
    }
    const { data, error } = await query
    if (error || !data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

export default async function sitemap() {
  const supabase = getSupabaseAdmin()

  // ── Static pages ───────────────────────────────────────────
  const staticPages = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/map`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/explore`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/regions`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/trails`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/events`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/submit`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/journal`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/operators`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/for-councils`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/plan-my-stay`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/on-this-road`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/discover`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/for-you`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/atlas-index`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ]

  // ── Dynamic pages (fetched in parallel) ────────────────────
  const [listings, regions, trails, events, articles, seoPages] = await Promise.all([
    // Listings — paginated (may exceed 1000). Admin/QA fixture slugs
    // (see lib/listings/publicFilter) never enter the sitemap.
    fetchAllPaginated(supabase, 'listings', 'slug, updated_at', [
      ['eq', 'status', 'active'],
      ['not', 'slug', 'ilike', 'admin%'],
      // needs_review=true venues must not be indexed (CLAUDE.md hard rule).
      ['or', 'needs_review.is.null,needs_review.eq.false'],
    ]),
    // Regions
    supabase
      .from('regions')
      .select('slug, updated_at')
      .eq('status', 'live')
      .then(r => r.data || []),
    // Trails (public, with slug)
    supabase
      .from('trails')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .eq('visibility', 'public')
      .then(r => r.data || []),
    // Events (upcoming)
    supabase
      .from('events')
      .select('slug, updated_at')
      .gte('event_date', new Date().toISOString())
      .then(r => r.data || []),
    // Articles (published)
    supabase
      .from('articles')
      .select('slug, updated_at')
      .eq('status', 'published')
      .then(r => r.data || []),
    // SEO pages (published)
    supabase
      .from('seo_pages')
      .select('slug, published_at')
      .eq('status', 'published')
      .then(r => r.data || []),
  ])

  const listingPages = listings.map(l => ({
    url: `${SITE_URL}/place/${l.slug}`,
    lastModified: l.updated_at ? new Date(l.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const regionPages = regions.map(r => ({
    url: `${SITE_URL}/regions/${r.slug}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const trailPages = trails.map(t => ({
    url: `${SITE_URL}/trails/${t.slug}`,
    lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const eventPages = events.map(e => ({
    url: `${SITE_URL}/events/${e.slug}`,
    lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const articlePages = articles.map(a => ({
    url: `${SITE_URL}/journal/${a.slug}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const seoPageEntries = seoPages.map(p => ({
    url: `${SITE_URL}/seo/${p.slug}`,
    lastModified: p.published_at ? new Date(p.published_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // Each prefixed locale's home as an explicit entry, plus alternates on every
  // URL so search engines discover the /ko and /zh surfaces for the whole site.
  const localeHomes = PREFIXED_LOCALES.map((loc) => ({
    url: `${SITE_URL}${localizePath('/', loc)}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  return [
    ...staticPages,
    ...localeHomes,
    ...listingPages,
    ...regionPages,
    ...trailPages,
    ...eventPages,
    ...articlePages,
    ...seoPageEntries,
  ].map(withAlternates)
}
