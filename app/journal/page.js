import { getLocale } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import JournalFeed from './JournalFeed'
import { overlayArticleTranslations } from '@/lib/i18n/overlayEditorial'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

export const revalidate = 3600 // ISR: refresh every hour

export async function generateMetadata() {
  const locale = await getLocale()
  return {
    title: { en: 'From the Network | Australian Atlas', ko: '네트워크 이야기 | Australian Atlas', zh: '来自网络 | Australian Atlas' }[locale] || 'From the Network | Australian Atlas',
    description: {
      en: 'Stories, guides, and dispatches from across the Atlas — independent Australia told through ten lenses.',
      ko: '아틀라스 전역에서 전하는 이야기, 가이드, 소식 — 열 개의 렌즈로 담아낸 독립적인 호주.',
      zh: '来自 Atlas 各地的故事、指南与报道 —— 以十个视角讲述独立的澳大利亚。',
    }[locale] || 'Stories, guides, and dispatches from across the Atlas — independent Australia told through ten lenses.',
  }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way', atlas: 'Atlas',
}

const VERTICAL_COLORS = { ...VERTICAL_ACCENTS, atlas: '#2D2A26' }

// ── Articles live in the master DB; detail pages are /journal/[slug] ──

async function getArticles() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, vertical, verticals, title, slug, excerpt, hero_image_url, author, published_at, category, region_tags, listing_tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(60)
    return data || []
  } catch {
    return []
  }
}

// ── Page ───────────────────────────────────────────────────

export default async function JournalPage() {
  const raw = await getArticles()

  // Overlay ko/zh title/excerpt translations while ids are still the raw
  // article ids (article_translations keys on articles.id).
  const localized = await overlayArticleTranslations(raw, await getLocale())

  const articles = localized.map(a => {
    const verts = Array.isArray(a.verticals) && a.verticals.length > 0 ? a.verticals : [a.vertical || 'atlas']
    return {
      id: a.id,
      vertical: verts[0],
      verticals: verts,
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt || null,
      hero_image_url: a.hero_image_url || null,
      author: a.author || null,
      published_at: a.published_at,
      category: a.category || null,
      tags: [...(a.region_tags || [])].filter(Boolean),
      href: `/journal/${a.slug}`,
    }
  })

  // Extract unique verticals and tags for filter bar
  const verticals = [...new Set(articles.map(a => a.vertical).filter(Boolean))]
    .map(v => ({ key: v, label: VERTICAL_LABELS[v] || v, color: VERTICAL_COLORS[v] || '#888' }))
  const allTags = [...new Set(articles.flatMap(a => a.tags || []).filter(Boolean))].sort()

  return (
    <JournalFeed
      articles={articles}
      verticals={verticals}
      tags={allTags}
      verticalLabels={VERTICAL_LABELS}
      verticalColors={VERTICAL_COLORS}
    />
  )
}
