import { getSupabaseAdmin, getCmsClient } from '../supabase/clients.js'

/**
 * Sync published articles from the Atlas CMS to the master DB.
 * The CMS manages articles across multiple verticals.
 */
export async function syncArticles() {
  const master = getSupabaseAdmin()
  const cms = getCmsClient()

  console.log('[sync] Starting article sync from CMS...')

  // Fetch all published articles from CMS
  const { data: articles, error: fetchError } = await cms
    .from('articles')
    .select('*')
    .eq('status', 'published')

  if (fetchError) {
    console.error('[sync] CMS article fetch error:', fetchError.message)
    return { synced: 0, error: fetchError.message }
  }

  if (!articles || articles.length === 0) {
    console.log('[sync] No published articles found in CMS')
    return { synced: 0, error: null }
  }

  console.log(`[sync] Fetched ${articles.length} published articles from CMS`)

  let synced = 0
  let errors = 0

  for (const article of articles) {
    try {
      // Support both multi-vertical (verticals[]) and legacy single (vertical)
      const effectiveVerticals = Array.isArray(article.verticals) && article.verticals.length > 0
        ? article.verticals
        : [article.vertical || 'atlas']

      const { error: upsertError } = await master
        .from('articles')
        .upsert({
          cms_id: String(article.id),
          vertical: effectiveVerticals[0],
          verticals: effectiveVerticals,
          title: article.title,
          slug: article.slug,
          excerpt: article.deck || article.excerpt || null,
          body: article.body || article.content || null,
          hero_image_url: article.hero_image_url || article.cover_image_url || null,
          author: article.author || article.author_name || null,
          status: 'published',
          published_at: article.published_at,
          region_tags: article.region_tags || [],
          listing_tags: article.listing_tags || [],
          category: article.category,
          synced_at: new Date().toISOString(),
        }, {
          onConflict: 'cms_id',
        })

      if (upsertError) {
        console.error(`[sync] Article upsert error for "${article.title}":`, upsertError.message)
        errors++
        continue
      }
      synced++
    } catch (err) {
      console.error(`[sync] Article unexpected error:`, err.message)
      errors++
    }
  }

  // Update region article counts
  await updateRegionArticleCounts(master)

  console.log(`[sync] Articles complete: ${synced} synced, ${errors} errors`)
  return { synced, errors }
}

/**
 * Update denormalized article_count on regions table
 */
async function updateRegionArticleCounts(master) {
  const { data: regions } = await master.from('regions').select('id, slug')
  if (!regions) return

  for (const region of regions) {
    const { count } = await master
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .contains('region_tags', [region.slug])
      .eq('status', 'published')

    await master
      .from('regions')
      .update({ article_count: count || 0 })
      .eq('id', region.id)
  }
}
