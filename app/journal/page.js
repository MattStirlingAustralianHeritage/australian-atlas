import { getSupabaseAdmin, getVerticalClient } from '@/lib/supabase/clients'
import JournalFeed from './JournalFeed'

export const revalidate = 3600 // ISR: refresh every hour

export const metadata = {
  title: 'From the Network | Australian Atlas',
  description: 'Stories, guides, and dispatches from across the Atlas — independent Australia told through nine lenses.',
}

const VERTICAL_JOURNAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/journal',
  collection: 'https://collectionatlas.com.au/journal',
  craft: 'https://craftatlas.com.au/journal',
  fine_grounds: 'https://finegroundsatlas.com.au/journal',
  rest: 'https://restatlas.com.au/journal',
  field: 'https://fieldatlas.com.au/journal',
  corner: 'https://corneratlas.com.au/journal',
  found: 'https://foundatlas.com.au/journal',
  table: 'https://tableatlas.com.au/journal',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', atlas: 'Atlas',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
  atlas: '#2D2A26',
}

// ── Pull from master DB (CMS-synced articles) ──────────────

async function getArticlesFromMaster() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, vertical, title, slug, excerpt, hero_image_url, author, published_at, category, region_tags, listing_tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(60)

    return (data || []).map(a => ({
      id: `master-${a.id}`,
      vertical: a.vertical || 'atlas',
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt || null,
      hero_image_url: a.hero_image_url || null,
      author: a.author || null,
      published_at: a.published_at,
      category: a.category || null,
      tags: [...(a.region_tags || []), ...(a.listing_tags || [])].filter(Boolean),
      canonical_url: `${VERTICAL_JOURNAL_URLS[a.vertical] || VERTICAL_JOURNAL_URLS.sba}/${a.slug}`,
    }))
  } catch {
    return []
  }
}

// ── Pull directly from vertical DBs ───────────────────────

async function getArticlesFromVerticals() {
  const articles = []

  // SBA — confirmed to have journal content
  try {
    const sbaClient = getVerticalClient('sba')
    const { data } = await sbaClient
      .from('articles')
      .select('id, title, slug, deck, category, author, hero_image_url, published_at, tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)

    if (data) {
      articles.push(...data.map(a => ({
        id: `sba-${a.id}`,
        vertical: 'sba',
        title: a.title,
        slug: a.slug,
        excerpt: a.deck || null,
        hero_image_url: a.hero_image_url || null,
        author: a.author || null,
        published_at: a.published_at,
        category: a.category || null,
        tags: a.tags || [],
        canonical_url: `https://smallbatchatlas.com.au/journal/${a.slug}`,
      })))
    }
  } catch { /* SBA journal not available */ }

  // Add other verticals here as their journal content grows
  // Each follows the same pattern: try/catch, map to common shape

  return articles
}

// ── Page ───────────────────────────────────────────────────

export default async function JournalPage() {
  const [masterArticles, verticalArticles] = await Promise.all([
    getArticlesFromMaster(),
    getArticlesFromVerticals(),
  ])

  // Merge and deduplicate by slug (master takes priority)
  const slugSet = new Set()
  const allArticles = []

  for (const a of masterArticles) {
    if (!slugSet.has(a.slug)) {
      slugSet.add(a.slug)
      allArticles.push(a)
    }
  }
  for (const a of verticalArticles) {
    if (!slugSet.has(a.slug)) {
      slugSet.add(a.slug)
      allArticles.push(a)
    }
  }

  // Sort by published_at descending
  allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))

  // Extract unique verticals and tags for filter bar
  const verticals = [...new Set(allArticles.map(a => a.vertical).filter(Boolean))]
    .map(v => ({ key: v, label: VERTICAL_LABELS[v] || v, color: VERTICAL_COLORS[v] || '#888' }))
  const allTags = [...new Set(allArticles.flatMap(a => a.tags || []).filter(Boolean))].sort()

  return (
    <JournalFeed
      articles={allArticles}
      verticals={verticals}
      tags={allTags}
      verticalLabels={VERTICAL_LABELS}
      verticalColors={VERTICAL_COLORS}
    />
  )
}
