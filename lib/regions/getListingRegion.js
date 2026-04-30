// ─────────────────────────────────────────────────────────────────────────────
// Region helpers for listings — Phase 3 step 1 (Batch 1).
//
// Reads the effective region for a listing using the FK relations
// (region_override_id and region_computed_id) with override-wins
// precedence per the regions architecture (Decision 3).
//
// Consumers must fetch listings with both relations joined. Use the
// LISTING_REGION_SELECT constant to extend Supabase select strings:
//
//     import { LISTING_REGION_SELECT, getListingRegion } from '@/lib/regions'
//
//     const { data } = await sb.from('listings')
//       .select(`id, name, ${LISTING_REGION_SELECT}, ...`)
//       .eq('status', 'active')
//
//     const region = getListingRegion(data[0])
//     // → { id, slug, name, state } | null
//
// The legacy `listings.region` text column is deprecated. Phase 3 step 3
// drops it. Until then, callers should not read `listing.region` directly
// for display — use this helper instead.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RegionRef
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} state
 */

/**
 * Returns the effective region for a listing, applying override-wins
 * precedence. The listing must have been fetched with LISTING_REGION_SELECT.
 *
 * @param {Object|null|undefined} listing - Listing row with joined region relations.
 * @returns {RegionRef | null}
 */
export function getListingRegion(listing) {
  return listing?.region_override ?? listing?.region_computed ?? null
}

/**
 * Returns full region context including override-vs-computed provenance.
 * Use sparingly — only for admin UI, debugging, and quarantine triage.
 * Most consumers should use getListingRegion.
 *
 * @param {Object|null|undefined} listing
 * @returns {{
 *   effective: RegionRef | null,
 *   isOverridden: boolean,
 *   computed: RegionRef | null,
 *   override: RegionRef | null,
 * }}
 */
export function getListingRegionDetail(listing) {
  const computed = listing?.region_computed ?? null
  const override = listing?.region_override ?? null
  return {
    effective: override ?? computed,
    isOverridden: override !== null && override !== undefined,
    computed,
    override,
  }
}

/**
 * Select fragment for embedding the region relations in a Supabase select.
 *
 * Concatenate into a select string:
 *
 *     .select(`id, name, ${LISTING_REGION_SELECT}, ...`)
 *
 * Resolves to `region_computed` and `region_override` keys on the result row,
 * each shaped as `{ id, slug, name, state } | null`.
 */
export const LISTING_REGION_SELECT = [
  'region_computed:regions!region_computed_id(id,slug,name,state)',
  'region_override:regions!region_override_id(id,slug,name,state)',
].join(',')

/**
 * Resolves a listing's effective region NAME (string) along with the source
 * the resolution came from. The fallback chain mirrors getListingRegion()
 * but adds the legacy text column as a final fallback and reports
 * provenance — useful for sync code that needs a single text value to push
 * to vertical schemas which haven't migrated to override-aware columns yet.
 *
 * Fallback order:
 *   1. region_override.name   → source 'override'
 *   2. region_computed.name   → source 'computed'
 *   3. listing.region (text)  → source 'legacy'
 *   4. nothing                → source 'null', name = null
 *
 * The listing must have been fetched with LISTING_REGION_SELECT so that
 * region_override and region_computed are populated relations. If those
 * relations are absent (e.g. the caller forgot to join), the helper
 * silently falls through to the legacy text column or null — by design,
 * since stale joins are a more common source of confusion than missing
 * data here.
 *
 * Single source of truth for "what region text gets written to verticals"
 * during the regions overhaul. Once Phase 3 lands override columns on
 * vertical schemas, the legacy fallback can be removed and verticals can
 * read overrides directly.
 *
 * @param {Object|null|undefined} listing
 * @returns {{ name: string | null, source: 'override' | 'computed' | 'legacy' | 'null' }}
 */
export function resolveRegionName(listing) {
  if (listing?.region_override?.name) {
    return { name: listing.region_override.name, source: 'override' }
  }
  if (listing?.region_computed?.name) {
    return { name: listing.region_computed.name, source: 'computed' }
  }
  if (listing?.region) {
    return { name: listing.region, source: 'legacy' }
  }
  return { name: null, source: 'null' }
}
