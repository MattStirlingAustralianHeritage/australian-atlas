// ============================================================
// Cross-vertical listing filter — forward-compatible
// ============================================================
// A listing can belong to more than one vertical (migration 142 adds
// listings.verticals text[], and recreates the listings_with_region view so
// it too exposes the column). These helpers let read sites match a listing by
// ANY of its verticals, while DEGRADING GRACEFULLY to the legacy scalar
// `vertical` column when the migration hasn't been applied yet — so the code
// is safe to deploy in any order relative to the migration.
//
// The presence check is per-RELATION (table vs view) because the column can
// land on `listings` before the `listings_with_region` view is recreated.
// Always pass the same relation name the query reads from.
//
// Usage (replaces `query.eq('vertical', v)`):
//   let query = sb.from('listings_with_region').select('...').eq('status','active')
//   query = filterByVertical(query, vertical, await relationHasVerticals(sb, 'listings_with_region'))
//   const { data } = await query
// ============================================================

// Process-level cache: relation name → boolean (has `verticals`). Probed once
// per relation.
const _relationHasVerticals = new Map()

/**
 * Does `relation` (the listings table or a view over it) expose the
 * cross-vertical `verticals` column? Probed once per relation and cached.
 * Any non-"column missing" outcome is treated as present, so a transient
 * error never silently disables the array.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} [relation='listings']
 * @returns {Promise<boolean>}
 */
export async function relationHasVerticals(sb, relation = 'listings') {
  if (_relationHasVerticals.has(relation)) return _relationHasVerticals.get(relation)
  let present
  try {
    const { error } = await sb.from(relation).select('verticals').limit(1)
    const missing = error && (error.code === '42703' || /column .*verticals.* does not exist/i.test(error.message || ''))
    present = !missing
  } catch {
    present = true // network/unknown — assume present so we don't permanently fall back
  }
  _relationHasVerticals.set(relation, present)
  return present
}

/**
 * Apply a "listing appears under this vertical" filter to a PostgREST query.
 * Uses array containment (verticals @> [vertical]) when the relation exposes
 * the column, else the legacy `.eq('vertical', …)`. Returns the (re-assigned)
 * query builder — assign the result back.
 *
 * IMPORTANT: this is SYNCHRONOUS by design. A supabase-js query builder is a
 * thenable, and returning one from an async function makes JS's promise
 * resolution assimilate (execute) it — turning the builder into a result
 * object mid-chain. So the async column probe is split out: pass its boolean
 * result as `hasVerticals`. Idiom:
 *   query = filterByVertical(query, vertical, await relationHasVerticals(sb, relation))
 * @param {object} query     a supabase-js query builder
 * @param {string} vertical
 * @param {boolean} hasVerticals  result of relationHasVerticals() for the relation
 */
export function filterByVertical(query, vertical, hasVerticals) {
  if (!vertical) return query
  return hasVerticals ? query.contains('verticals', [vertical]) : query.eq('vertical', vertical)
}

/**
 * The list of verticals a listing row appears under. Falls back to the scalar
 * `vertical` when the array is absent/empty. Use for in-memory grouping/fan-out
 * (e.g. region pages) where a query filter isn't enough.
 * @param {{ vertical?: string, verticals?: string[] }} listing
 * @returns {string[]}
 */
export function listingVerticals(listing) {
  if (Array.isArray(listing?.verticals) && listing.verticals.length > 0) {
    return listing.verticals
  }
  return listing?.vertical ? [listing.vertical] : []
}

/**
 * Normalise a primary + optional extras into a clean verticals[]: primary
 * first, de-duplicated, falsy values dropped.
 * @param {string} primary
 * @param  {...(string|null|undefined)} extras
 * @returns {string[]}
 */
export function buildVerticals(primary, ...extras) {
  const out = []
  for (const v of [primary, ...extras]) {
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

// Test seam: reset cached probes (used only by tests / scripts).
export function __resetVerticalsColumnCache() {
  _relationHasVerticals.clear()
}
