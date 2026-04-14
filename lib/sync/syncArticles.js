import { getSupabaseAdmin, getCmsClient } from '../supabase/clients.js'

/**
 * Sync published articles from the Atlas CMS to the master DB.
 * The CMS manages articles across multiple verticals.
 *
 * CRITICAL RULE: This sync NEVER overwrites the body or content field
 * of any existing article. Article body content is sacred — only manual
 * admin edits via the CMS editor may modify published body content.
 *
 * For new articles (no existing cms_id match), body IS written on first insert.
 * For existing articles, only metadata fields are updated (title, excerpt,
 * hero image, tags, etc).
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
  let inserted = 0
  let updated = 0
  let errors = 0
  let bodyProtected = 0

  for (const article of articles) {
    try {
      // Support both multi-vertical (verticals[]) and legacy single (vertical)
      const effectiveVerticals = Array.isArray(article.verticals) && article.verticals.length > 0
        ? article.verticals
        : [article.vertical || 'atlas']

      const cmsId = String(article.id)

      // ── Check if article already exists in master DB ──────
      const { data: existing } = await master
        .from('articles')
        .select('id, body_locked')
        .eq('cms_id', cmsId)
        .maybeSingle()

      if (existing) {
        // ── UPDATE existing article — NEVER touch body ──────
        // Only sync metadata fields. Body content is sacred.
        const { error: updateError } = await master
          .from('articles')
          .update({
            vertical: effectiveVerticals[0],
            verticals: effectiveVerticals,
            title: article.title,
            slug: article.slug,
            excerpt: article.deck || article.excerpt || null,
            // BODY INTENTIONALLY OMITTED — never overwrite published body
            hero_image_url: article.hero_image_url || article.cover_image_url || null,
            author: article.author || article.author_name || null,
            status: 'published',
            published_at: article.published_at,
            region_tags: article.region_tags || [],
            listing_tags: article.listing_tags || [],
            category: article.category,
            synced_at: new Date().toISOString(),
          })
          .eq('cms_id', cmsId)

        if (updateError) {
          console.error(`[sync] Article update error for "${article.title}":`, updateError.message)
          errors++
          continue
        }

        bodyProtected++
        updated++
        synced++
      } else {
        // ── INSERT new article — body IS written on first create ──
        const { error: insertError } = await master
          .from('articles')
          .insert({
            cms_id: cmsId,
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
            body_locked: true, // Lock immediately on first publish
            body_updated_at: new Date().toISOString(),
            body_updated_by: 'cms_sync_initial',
          })

        if (insertError) {
          // If conflict (race condition), just update metadata
          if (insertError.code === '23505') {
            console.log(`[sync] Article "${article.title}" already exists (race), skipping body`)
            synced++
            continue
          }
          console.error(`[sync] Article insert error for "${article.title}":`, insertError.message)
          errors++
          continue
        }

        inserted++
        synced++
      }
    } catch (err) {
      console.error(`[sync] Article unexpected error:`, err.message)
      errors++
    }
  }

  // Update region article counts
  await updateRegionArticleCounts(master)

  console.log(`[sync] Articles complete: ${synced} synced (${inserted} new, ${updated} updated, ${bodyProtected} body-protected), ${errors} errors`)
  return { synced, inserted, updated, bodyProtected, errors }
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
