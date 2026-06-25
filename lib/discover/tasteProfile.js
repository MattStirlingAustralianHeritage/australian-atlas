// ============================================================
// Discover taste profile — derived from a user's SAVED listings
// (the rows the Discover feature writes to user_saves). A cheap,
// native, interpretable signal (no embeddings, no Anthropic API)
// used to lightly personalise Plan a Stay and Plan a Trip: the more
// a user discovers/saves a kind of place, the more their trips lean
// that way.
//
// Returns normalised SHARES (0–1) per vertical / sub_type / region,
// so the signal strengthens and sharpens as the user saves more.
// Returns null for anonymous users or users with no saves → callers
// fall back to their existing, un-personalised behaviour.
// ============================================================

const MAX_SAVES = 300

/**
 * @param {object} sb      supabase admin client
 * @param {string} userId  authenticated user id (or null)
 * @returns {Promise<null | {
 *   savedCount: number,
 *   verticalWeights: Record<string, number>,
 *   subTypeWeights: Record<string, number>,
 *   regionWeights: Record<string, number>,
 * }>}
 */
export async function getUserTasteProfile(sb, userId) {
  if (!userId) return null

  const { data, error } = await sb
    .from('user_saves')
    .select('listing:listing_id (vertical, sub_type, region)')
    .eq('user_id', userId)
    .limit(MAX_SAVES)

  if (error || !data || data.length === 0) return null

  const verticals = {}
  const subTypes = {}
  const regions = {}
  let n = 0

  for (const row of data) {
    const l = row.listing
    if (!l) continue
    n += 1
    if (l.vertical) verticals[l.vertical] = (verticals[l.vertical] || 0) + 1
    if (l.sub_type) subTypes[l.sub_type] = (subTypes[l.sub_type] || 0) + 1
    const reg = (l.region || '').trim()
    if (reg) regions[reg] = (regions[reg] || 0) + 1
  }
  if (n === 0) return null

  const normalise = (obj) => {
    const out = {}
    for (const k in obj) out[k] = obj[k] / n
    return out
  }

  return {
    savedCount: n,
    verticalWeights: normalise(verticals),
    subTypeWeights: normalise(subTypes),
    regionWeights: normalise(regions),
  }
}

/**
 * A 0–1 taste affinity for a candidate listing given a profile. sub_type is a
 * sharper signal than vertical, so it's weighted higher. Returns 0 when there's
 * no profile, so callers can add `tasteAffinity * WEIGHT` unconditionally.
 */
export function tasteAffinity(profile, listing) {
  if (!profile || !listing) return 0
  const v = profile.verticalWeights[listing.vertical] || 0
  const s = listing.sub_type ? (profile.subTypeWeights[listing.sub_type] || 0) : 0
  return Math.min(1, v + 2 * s)
}
