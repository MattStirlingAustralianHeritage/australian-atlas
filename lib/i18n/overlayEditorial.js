import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { defaultLocale } from '@/lib/i18n/config'

// Korean launch (feat/ko-launch): overlay translated EDITORIAL content
// (regions + journal articles) from the additive region_translations /
// article_translations tables (migration 217), field-by-field, English
// fallback (never blank). No-op for the default locale. Fully resilient.

// Overlay one region's editorial fields.
export async function overlayRegionTranslation(region, locale, sb = null) {
  if (!region || !region.id || !locale || locale === defaultLocale) return region
  try {
    const client = sb || getSupabaseAdmin()
    const { data } = await client
      .from('region_translations')
      .select('name, description, generated_intro, long_description')
      .eq('region_id', region.id)
      .eq('locale', locale)
      .maybeSingle()
    if (!data) return region
    const pick = (t, en) => (t && String(t).trim() ? t : en)
    return {
      ...region,
      name: pick(data.name, region.name),
      description: pick(data.description, region.description),
      generated_intro: pick(data.generated_intro, region.generated_intro),
      long_description: pick(data.long_description, region.long_description),
    }
  } catch {
    return region
  }
}

// Overlay a LIST of articles' card fields (title/excerpt/meta) — batched.
export async function overlayArticleTranslations(articles, locale, sb = null) {
  if (!Array.isArray(articles) || articles.length === 0) return articles
  if (!locale || locale === defaultLocale) return articles
  const ids = [...new Set(articles.map((a) => a && a.id).filter(Boolean))]
  if (ids.length === 0) return articles
  try {
    const client = sb || getSupabaseAdmin()
    const { data } = await client
      .from('article_translations')
      .select('article_id, title, excerpt, meta_description')
      .eq('locale', locale)
      .in('article_id', ids)
    const map = new Map((data || []).map((r) => [r.article_id, r]))
    if (map.size === 0) return articles
    const pick = (t, en) => (t && String(t).trim() ? t : en)
    return articles.map((a) => {
      const tr = a && map.get(a.id)
      if (!tr) return a
      return {
        ...a,
        title: pick(tr.title, a.title),
        excerpt: pick(tr.excerpt, a.excerpt),
        meta_description: pick(tr.meta_description, a.meta_description),
      }
    })
  } catch {
    return articles
  }
}

// Overlay ONE article including body (for the detail page).
export async function overlayArticleTranslation(article, locale, sb = null) {
  if (!article || !article.id || !locale || locale === defaultLocale) return article
  try {
    const client = sb || getSupabaseAdmin()
    const { data } = await client
      .from('article_translations')
      .select('title, excerpt, body, meta_description')
      .eq('article_id', article.id)
      .eq('locale', locale)
      .maybeSingle()
    if (!data) return article
    const pick = (t, en) => (t && String(t).trim() ? t : en)
    return {
      ...article,
      title: pick(data.title, article.title),
      excerpt: pick(data.excerpt, article.excerpt),
      body: pick(data.body, article.body),
      meta_description: pick(data.meta_description, article.meta_description),
    }
  } catch {
    return article
  }
}
