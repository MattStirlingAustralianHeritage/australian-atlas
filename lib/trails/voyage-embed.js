/**
 * Embed a single thesis/text for the trail-pitch scorer.
 *
 * Routes through the shared Voyage helper (voyage-3.5 @ 1024, input_type
 * "document" to match the listing embeddings it is cosine-compared against in
 * lib/trails/scoring.js). Returns a 1024-dim float array, or null on error.
 */
import { embedDocuments } from '../embeddings/voyage.js'

export async function embedText(text) {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn('[trails/embed] VOYAGE_API_KEY not configured — returning null')
    return null
  }
  if (!text || !text.trim()) return null
  try {
    const [emb] = await embedDocuments([text])
    return emb ?? null
  } catch (e) {
    console.warn('[trails/embed] embed failed:', e.message)
    return null
  }
}
