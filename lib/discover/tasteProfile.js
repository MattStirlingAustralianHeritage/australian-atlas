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
 * Aggregate a set of {vertical, sub_type, region} rows into normalised SHARES.
 * Shared by every taste-shape producer so they are byte-identical and a drop-in
 * for tasteAffinity(). Returns null when no row carries usable signal.
 */
function sharesFromRows(rows) {
  const verticals = {}
  const subTypes = {}
  const regions = {}
  let n = 0

  for (const l of rows || []) {
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

  return sharesFromRows(data.map((row) => row.listing))
}

/**
 * Build the same SHARES shape from an explicit list of listing IDs — the
 * in-session "I'd visit this" picks made during the planner onboarding flow.
 *
 * This is what lets an ANONYMOUS visitor's Discover choices inform their trip
 * without an account: the planner posts the picked IDs, we resolve their
 * vertical/sub_type/region here, and the result drops straight into the same
 * tasteAffinity() ranking the signed-in path uses. Returns null on no IDs / no
 * rows / read failure so the caller degrades to un-personalised behaviour.
 *
 * @param {object} sb           supabase admin client
 * @param {string[]} listingIds picked listing ids
 */
export async function buildTasteProfileFromListingIds(sb, listingIds) {
  if (!sb || !Array.isArray(listingIds) || listingIds.length === 0) return null
  const ids = [...new Set(listingIds.map(String))].slice(0, MAX_SAVES)
  try {
    const { data, error } = await sb
      .from('listings')
      .select('vertical, sub_type, region')
      .in('id', ids)
    if (error || !data || data.length === 0) return null
    return sharesFromRows(data)
  } catch {
    return null
  }
}

/**
 * Combine several taste profiles into one, each contributing in proportion to
 * its source count (a 20-save history outweighs a 3-pick session, but both are
 * heard). Nulls are ignored; returns null when nothing has signal. Used to fold
 * a signed-in user's persisted profile together with the picks they just made
 * in the onboarding deck so THIS trip reflects both.
 */
export function mergeTasteProfiles(...profiles) {
  const present = profiles.filter((p) => p && p.savedCount > 0)
  if (present.length === 0) return null
  if (present.length === 1) return present[0]

  const totalN = present.reduce((s, p) => s + p.savedCount, 0)
  const blend = (key) => {
    const out = {}
    for (const p of present) {
      const w = p.savedCount / totalN
      for (const k in p[key]) out[k] = (out[k] || 0) + p[key][k] * w
    }
    return out
  }

  return {
    savedCount: totalN,
    verticalWeights: blend('verticalWeights'),
    subTypeWeights: blend('subTypeWeights'),
    regionWeights: blend('regionWeights'),
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
