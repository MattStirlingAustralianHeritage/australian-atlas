import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '../supabase/clients.js'

const BATCH_SIZE = 20
const DELAY_MS = 500  // rate limit buffer between batches

/**
 * Generate embeddings for listings and articles that don't have one yet.
 * Uses Anthropic's embedding model (voyage-3 via the Anthropic API).
 *
 * Note: Anthropic doesn't have a native embedding endpoint — we use Voyage AI
 * which is the recommended embedding provider. If the project uses OpenAI
 * embeddings instead, swap the client below.
 *
 * For now, we construct a text representation and use a placeholder that
 * should be replaced with the actual embedding API call for your provider.
 */
export async function generateEmbeddings() {
  const master = getSupabaseAdmin()

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
      }

      if (i + BATCH_SIZE < articles.length) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }
  }
}

/**
 * Get embeddings for an array of texts.
 * Replace this with your actual embedding provider.
 *
 * If using OpenAI:
 *   const openai = new OpenAI()
 *   const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: texts })
 *   return res.data.map(d => d.embedding)
 *
 * If using Voyage AI (recommended by Anthropic):
 *   const res = await fetch('https://api.voyageai.com/v1/embeddings', { ... })
 */
async function getEmbeddings(texts) {
  try {
    // Using Supabase's built-in embedding generation via Edge Functions
    // or a direct call to your embedding provider.
    //
    // TODO: Replace with your actual embedding API call.
    // The schema expects 1536-dimensional vectors (OpenAI text-embedding-3-small compatible).
    //
    // Example with OpenAI (install openai package):
    // import OpenAI from 'openai'
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    // const res = await openai.embeddings.create({
    //   model: 'text-embedding-3-small',
    //   input: texts,
    // })
    // return res.data.map(d => d.embedding)

    console.warn('[embeddings] No embedding provider configured — skipping batch')
    return null
  } catch (err) {
    console.error('[embeddings] Error:', err.message)
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
