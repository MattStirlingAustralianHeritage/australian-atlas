// ============================================================
// Discover — in-session taste vector (§2 of the rebuild spec).
//
// The feed learns within a session from the listings a user has PICKED
// ("I'd visit this") and SKIPPED. We pull those listings' embeddings
// (the same vector(1024) column vibe search ranks on) and build:
//
//   taste = normalize( mean(picked_embeddings) − λ·mean(skipped_embeddings) )
//
// λ is small so skips nudge rather than dominate. The result is a
// pgvector literal string ready to hand to search_listings_hybrid as
// query_embedding (exactly how /api/similar seeds "more like this").
//
// Until there is at least one PICK, taste is undefined → cold start
// (the feed route seeds vertical-diverse cards instead). The server
// holds no session state; the client posts the id sets each request.
// ============================================================

import { toVectorLiteral } from '@/lib/embeddings/voyage'

// Skip weight. Start small (0.3) per spec; tune if the deck over-reacts.
export const TASTE_LAMBDA = 0.3

/** pgvector serialises an embedding as a JSON-shaped string "[0.1,0.2,…]".
 *  PostgREST may hand it back as that string or (rarely) a real array. */
function parseEmbedding(raw) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : null
    } catch {
      return null
    }
  }
  return null
}

function meanVector(vectors) {
  if (!vectors.length) return null
  const dim = vectors[0].length
  const acc = new Array(dim).fill(0)
  for (const v of vectors) {
    if (v.length !== dim) continue
    for (let i = 0; i < dim; i++) acc[i] += v[i]
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length
  return acc
}

function normalize(v) {
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm)
  if (!norm || !Number.isFinite(norm)) return null
  return v.map((x) => x / norm)
}

/**
 * Compute the session taste vector from picked/skipped embeddings.
 *
 * @param {object} sb              supabase admin client
 * @param {string[]} pickedIds     listing ids the user picked (order irrelevant)
 * @param {string[]} skippedIds    listing ids the user skipped
 * @returns {Promise<{ literal: string|null, error: string|null }>}
 *          literal is a pgvector string, or null for cold start / failure.
 */
export async function computeTasteVector(sb, pickedIds = [], skippedIds = []) {
  const picked = (pickedIds || []).map(String).filter(Boolean)
  if (picked.length === 0) return { literal: null, error: null } // cold start

  const skipped = (skippedIds || []).map(String).filter(Boolean)
  const need = [...new Set([...picked, ...skipped])]

  const { data, error } = await sb
    .from('listings')
    .select('id, embedding')
    .in('id', need)

  if (error) return { literal: null, error: error.message }

  const byId = new Map((data || []).map((r) => [String(r.id), parseEmbedding(r.embedding)]))

  const pickedVecs = picked.map((id) => byId.get(id)).filter(Boolean)
  // No embeddings on any picked listing (e.g. freshly added, not yet embedded)
  // → can't form a taste vector. Honest cold start rather than a bogus ranking.
  if (pickedVecs.length === 0) return { literal: null, error: null }

  const meanPicked = meanVector(pickedVecs)
  let taste = meanPicked

  const skippedVecs = skipped.map((id) => byId.get(id)).filter(Boolean)
  if (skippedVecs.length > 0) {
    const meanSkipped = meanVector(skippedVecs)
    taste = meanPicked.map((x, i) => x - TASTE_LAMBDA * meanSkipped[i])
  }

  const normed = normalize(taste)
  if (!normed) return { literal: null, error: null }

  return { literal: toVectorLiteral(normed), error: null }
}
