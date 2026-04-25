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
