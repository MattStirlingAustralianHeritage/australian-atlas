import { getSupabaseAdmin } from '../supabase/clients.js'

const BATCH_SIZE = 20
const DELAY_MS = 500  // rate limit buffer between batches
const VOYAGE_MODEL = 'voyage-3'

/**
 * Generate embeddings for listings and articles that don't have one yet.
 * Uses Voyage AI (Anthropic's recommended embedding provider).
 *
 * Requires VOYAGE_API_KEY in environment variables.
 * Model: voyage-3 (1024 dimensions)
 * Docs: https://docs.voyageai.com/docs/embeddings
 */
export async function generateEmbeddings() {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn('[embeddings] VOYAGE_API_KEY not configured — skipping')
    return { listings: 0, articles: 0 }
  }

  const master = getSupabaseAdmin()
  let listingCount = 0
  let articleCount = 0

  // Listings without embeddings
  const { data: listings } = await master
    .from('listings')
    .select('id, name, description, region, state, vertical')
    .eq('status', 'active')
    .is('embedding', null)
    .limit(200)

  console.log(`[embeddings] ${listings?.length || 0} listings need embeddings`)

  if (listings && listings.length > 0) {
    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE)
      const texts = batch.map(l =>
        [l.name, l.description, l.region, l.state, verticalLabel(l.vertical)]
          .filter(Boolean)
          .join(' — ')
      )

      const embeddings = await getEmbeddings(texts)
      if (!embeddings) continue

      for (let j = 0; j < batch.length; j++) {
        await master
          .from('listings')
          .update({ embedding: embeddings[j] })
          .eq('id', batch[j].id)
        listingCount++
      }

      if (i + BATCH_SIZE < listings.length) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }
  }

  // Articles without embeddings
  const { data: articles } = await master
    .from('articles')
    .select('id, title, excerpt, category, vertical')
    .eq('status', 'published')
    .is('embedding', null)
    .limit(100)

  console.log(`[embeddings] ${articles?.length || 0} articles need embeddings`)

  if (articles && articles.length > 0) {
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE)
      const texts = batch.map(a =>
        [a.title, a.excerpt, a.category, verticalLabel(a.vertical)]
          .filter(Boolean)
          .join(' — ')
      )

      const embeddings = await getEmbeddings(texts)
      if (!embeddings) continue

      for (let j = 0; j < batch.length; j++) {
        await master
          .from('articles')
          .update({ embedding: embeddings[j] })
          .eq('id', batch[j].id)
        articleCount++
      }

      if (i + BATCH_SIZE < articles.length) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }
  }

  console.log(`[embeddings] Done: ${listingCount} listings, ${articleCount} articles`)
  return { listings: listingCount, articles: articleCount }
}

/**
 * Get embeddings via Voyage AI SDK.
 * Requires VOYAGE_API_KEY env var.
 */
async function getEmbeddings(texts) {
  try {
    // Dynamic import since voyageai is ESM
    const { VoyageAIClient } = await import('voyageai')
    const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })

    const result = await client.embed({
      model: VOYAGE_MODEL,
      input: texts,
      inputType: 'document',
    })

    return result.data.map(d => d.embedding)
  } catch (err) {
    console.error('[embeddings] Voyage AI error:', err.message)
    return null
  }
}

function verticalLabel(v) {
  const labels = {
    sba: 'craft brewery winery distillery',
    collection: 'museum gallery heritage',
    craft: 'maker artist studio',
    fine_grounds: 'coffee roaster cafe',
    rest: 'boutique accommodation stay',
    field: 'nature natural place',
    corner: 'independent shop retail',
    found: 'vintage secondhand antique',
    table: 'food producer farm gate market',
    atlas: 'australian atlas',
  }
  return labels[v] || ''
}
