// ============================================================
// Durable taste profile reader — the single READ path for the three taste
// consumers (Discover feed, Plan a Stay, On This Road) into taste_profiles
// (migrations 185–187). Replaces the per-request recompute-from-user_saves so
// all three lean on ONE persisted signal (saves + owned trail-stops), kept warm
// by the statement-level triggers.
//
// Returns null whenever there is no durable signal to apply — no user, no row,
// or a profile below the confidence floor — so EVERY caller degrades to its
// existing, un-personalised behaviour. Never throws: a read failure → null →
// today's behaviour (the persisted layer must never break a logged-out or
// no-signal user).
//
// Shape contract:
//   shares  — byte-shape-identical to lib/discover/tasteProfile.js
//             getUserTasteProfile(): { savedCount, verticalWeights,
//             subTypeWeights, regionWeights }. A drop-in for tasteAffinity().
//   vector  — the L2-normalised durable embedding (1024-d) as a number[], ready
//             to seed the Discover feed; null when no positive listing was
//             embedded (shares may still be present).
// ============================================================

// Confidence floor: don't let a tiny history aggressively rerank. A 1–2 source
// profile is too coarse (a single save → that vertical share = 1.0). Mirrors
// REFLECTION_MIN_PICKS in tasteReflection.js. Below this → behave as no-profile.
export const MIN_SOURCE_COUNT = 3

/** pgvector serialises a vector as the JSON-shaped string "[0.1,0.2,…]".
 *  PostgREST hands it back as that string (or, rarely, a real array). */
function parseVector(raw) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) && arr.length ? arr : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Read the persisted taste profile for a user.
 *
 * @param {object} sb      supabase admin client (service role)
 * @param {string} userId  authenticated user id (or null/undefined)
 * @returns {Promise<null | { shares: object|null, vector: number[]|null, sourceCount: number }>}
 *          null = no durable signal → caller uses its existing behaviour.
 */
export async function getTasteProfile(sb, userId) {
  if (!userId) return null
  try {
    const { data, error } = await sb
      .from('taste_profiles')
      .select('taste_vector, category_shares, source_count')
      .eq('profile_id', userId)
      .maybeSingle()

    if (error || !data) return null
    // Confidence floor — a thin profile behaves as no-profile (today's path).
    if (!data.source_count || data.source_count < MIN_SOURCE_COUNT) return null

    return {
      shares: data.category_shares || null,
      vector: parseVector(data.taste_vector),
      sourceCount: data.source_count,
    }
  } catch {
    // Never break the caller on a read failure — degrade to today's behaviour.
    return null
  }
}
