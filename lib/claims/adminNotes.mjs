// How a moderator's note combines with the note already on a claim.
//
// The stored note is the claim's PROVENANCE: "Synced from {vertical} vertical."
// (written by /api/internal/sync-claim) or "Role: … Tier: … Domain: …" (written
// by the public claim form). It records who the claimant said they were and
// which domain they claimed to speak for — the evidence a grant rests on, and
// the only way to tell an operator-initiated claim from an admin grant after
// the fact.
//
// Both review paths used to write `admin_notes || null`, so approving or
// rejecting without typing anything silently deleted it. By the time this was
// noticed (2026-07-29) the origin of all 52 approved claims had been wiped.
//
// Pure and dependency-free so it can be tested directly — see adminNotes.test.mjs.

/**
 * @param {string|null|undefined} prior  note currently stored on the claim
 * @param {string|null|undefined} typed  note the moderator entered now (often blank)
 * @param {string} occasion              e.g. 'on approval' | 'on rejection'
 * @returns {string|null}                merged note, or null when there is nothing to store
 */
export function mergeAdminNotes(prior, typed, occasion) {
  const priorNote = String(prior ?? '').trim()
  const typedNote = String(typed ?? '').trim()
  if (priorNote && typedNote) return `${priorNote}\n— ${occasion}: ${typedNote}`
  return typedNote || priorNote || null
}
