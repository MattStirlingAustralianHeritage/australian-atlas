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

// Weight of the durable taste baseline H (taste_profiles.taste_vector) when
// blended with the live in-session vector S — option (a), seed-from-baseline:
//   effective = normalize( HISTORY_WEIGHT·H + (1 − HISTORY_WEIGHT)·S )
// 0 = ignore history (pre-wiring behaviour); 1 = history only; 0.5 = equal pull.
// Named so it's a one-line tune. ONLY applies when a baseline is supplied; with
// baseVector = null the function is byte-identical to its pre-wiring behaviour.
export const HISTORY_WEIGHT = 0.5

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
 * Compute the taste vector for the Discover feed.
 *
 * Session signal S (today): normalize( mean(pickedEmb) − λ·mean(skippedEmb) ).
 * Durable baseline H (option a): the persisted taste_profiles.taste_vector, a
 * unit vector over the user's saved/trail history. When H is supplied:
 *   both H and S → normalize( HISTORY_WEIGHT·H + (1−HISTORY_WEIGHT)·S )
 *   H only (no picks yet) → normalize( H − λ·mean(skippedEmb) ), or H if no skips
 *                           → history shapes the feed from card one
 *   S only / neither      → today's behaviour (session vector, or cold-start null)
 *
 * With baseVector = null (anonymous / no profile / below the confidence floor)
 * this is byte-identical to the pre-wiring behaviour.
 *
 * @param {object} sb              supabase admin client
 * @param {string[]} pickedIds     listing ids the user picked (order irrelevant)
 * @param {string[]} skippedIds    listing ids the user skipped
 * @param {number[]|null} baseVector  durable taste baseline H (unit), or null
 * @returns {Promise<{ literal: string|null, error: string|null }>}
 *          literal is a pgvector string, or null for cold start / failure.
 */
export async function computeTasteVector(sb, pickedIds = [], skippedIds = [], baseVector = null) {
  const picked = (pickedIds || []).map(String).filter(Boolean)
  const skipped = (skippedIds || []).map(String).filter(Boolean)

  // Durable baseline (option a). Absent → pre-wiring (session-only) behaviour.
  const base = Array.isArray(baseVector) && baseVector.length ? baseVector : null

  // Cold start: no picks AND no durable baseline → undefined taste (as today).
  if (picked.length === 0 && !base) return { literal: null, error: null }

  // Only hit the DB when there are session ids to resolve (a baseline-only,
  // no-activity request needs no listings read).
  const need = [...new Set([...picked, ...skipped])]
  let byId = new Map()
  if (need.length) {
    const { data, error } = await sb
      .from('listings')
      .select('id, embedding')
      .in('id', need)
    if (error) return { literal: null, error: error.message }
    byId = new Map((data || []).map((r) => [String(r.id), parseEmbedding(r.embedding)]))
  }

  const pickedVecs = picked.map((id) => byId.get(id)).filter(Boolean)
  const skippedVecs = skipped.map((id) => byId.get(id)).filter(Boolean)
  const meanSkipped = skippedVecs.length > 0 ? meanVector(skippedVecs) : null

  // Live in-session vector S (unit) — identical math to before the baseline.
  // No embedded picks → S undefined (an honest cold start, not a bogus ranking).
  let sessionUnit = null
  if (pickedVecs.length > 0) {
    const meanPicked = meanVector(pickedVecs)
    const s = meanSkipped ? meanPicked.map((x, i) => x - TASTE_LAMBDA * meanSkipped[i]) : meanPicked
    sessionUnit = normalize(s)
  }

  // Combine with the durable baseline per option (a).
  let effective
  if (base && sessionUnit) {
    effective = normalize(base.map((h, i) => HISTORY_WEIGHT * h + (1 - HISTORY_WEIGHT) * sessionUnit[i]))
  } else if (base) {
    // Baseline only (no embedded picks yet): apply this session's skips on top.
    effective = meanSkipped
      ? normalize(base.map((h, i) => h - TASTE_LAMBDA * meanSkipped[i]))
      : normalize(base.slice())
  } else {
    // No baseline → today's behaviour exactly (session vector, or null cold start).
    effective = sessionUnit
  }

  if (!effective) return { literal: null, error: null }
  return { literal: toVectorLiteral(effective), error: null }
}
