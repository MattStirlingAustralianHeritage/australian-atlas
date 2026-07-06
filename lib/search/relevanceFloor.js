/**
 * Calibrated relevance floor for the semantic search "Top result" badge.
 *
 * Problem: the badge was POSITIONAL (top-3), so every query — including nonsense
 * ("underwater basket weaving") — got a confident, badged top-3. The badge must
 * be EARNED: only results whose semantic similarity clears a measured floor.
 *
 * Score direction: `similarity = 1 - (embedding <=> query_embedding)` (cosine).
 * HIGHER = more similar. (The `<=>` operator is cosine DISTANCE, lower = closer;
 * `1 - distance` flips it to similarity.) The floor is a minimum similarity.
 *
 * Why PER-VERTICAL, not a single global number — measured on the live
 * embed+vector path (Voyage voyage-3.5, query input_type), top-1 similarity:
 *
 *   GOOD (in-scope) top-1s ranged 0.487–0.697; JUNK (nonsense) 0.401–0.568.
 *   They OVERLAP globally: junk "underwater basket weaving" (craft) = 0.568
 *   outscores good "cellar door with a kitchen" (sba) = 0.487. No single global
 *   floor can pass the good without also passing the junk.
 *
 *   But the two overlapping points are in DIFFERENT verticals, and WITHIN each
 *   vertical good vs junk separate cleanly:
 *     craft   junk 0.568 / good 0.604  -> floor 0.586 (gap midpoint)
 *     corner  junk 0.457 / good 0.641  -> floor 0.549 (gap midpoint)
 *     sba     good 0.487 (weakest valid GOOD); no junk landed in sba -> 0.46
 *     others  junk-max 0.489 / good-min 0.579 -> default 0.53 (gap midpoint)
 *
 *   Validated: 18/18 GOOD queries clear their vertical floor; 9/9 JUNK fall
 *   below it. See the goal's calibration table for the full battery.
 *
 * Applied in the application layer (front-end badge/section logic) on the
 * `similarity` the RPC already returns — the ranking RPC is NOT modified.
 */

export const RELEVANCE_FLOOR_BY_VERTICAL = {
  craft: 0.586,
  corner: 0.549,
  sba: 0.46,
}

// Verticals without both-sided calibration data fall here (the typical
// good-min 0.579 / junk-max 0.489 midpoint).
export const RELEVANCE_FLOOR_DEFAULT = 0.53

export function relevanceFloorFor(vertical) {
  return RELEVANCE_FLOOR_BY_VERTICAL[vertical] ?? RELEVANCE_FLOOR_DEFAULT
}

/**
 * Does this result clear its relevance gate (i.e. earn the badge)?
 *
 * /api/search now sends an authoritative per-row `strong` computed from the
 * cross-encoder rerank score — one calibrated floor, comparable across
 * verticals (these per-vertical bi-encoder floors are NOT: sba's 0.46 vs the
 * 0.53 default once let wineries matching one stray token out-badge the
 * genuinely-best rows of the detected atlas). Prefer the server flag; the
 * floors below remain the fallback for rows that don't carry it (fuzzy
 * name-match rows, older cached responses).
 */
export function isStrongMatch(listing) {
  if (listing && typeof listing.strong === 'boolean') return listing.strong
  const sim = listing && typeof listing.similarity === 'number' ? listing.similarity : -1
  return sim >= relevanceFloorFor(listing && listing.vertical)
}
