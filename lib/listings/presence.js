// ============================================================
// Listing presence helpers
//
// A listing's `presence_type` describes how a visitor encounters it:
//   permanent       — a fixed venue with a street address (the default)
//   mobile          — no fixed address: food trucks, coffee carts, pop-ups.
//                     Still visitable & discoverable; location varies.
//   by_appointment  — visit by arrangement (often address_on_request)
//   markets         — sells at markets only
//   online          — online-only, not visitable
//   seasonal        — open only part of the year
//
// `address_on_request` is an orthogonal flag: a permanent venue that simply
// doesn't publish its street address (makers who welcome visitors by booking).
// ============================================================

export const MOBILE_LABEL = 'Mobile venue'

/** True for food-truck-class venues with no fixed street address. These are
 *  discoverable & featured like permanent venues, but their exact location is
 *  never pinned or linked. */
export function isMobileListing(listing) {
  return listing?.presence_type === 'mobile'
}

/** True when a listing's EXACT location must be suppressed from public UI —
 *  no street address line, no map pin, no "Get Directions". Covers both
 *  address-on-request venues (by-appointment makers) and mobile venues (which
 *  have no fixed location to reveal). */
export function hideExactLocation(listing) {
  return !!listing?.address_on_request || isMobileListing(listing)
}

/** The public-facing "where to find them" line for a mobile venue: the
 *  operator's own service_area note if set, else a region-derived fallback,
 *  else a generic line. `regionName` is the resolved region display name. */
export function mobileLocationLine(listing, regionName) {
  const note = (listing?.service_area || '').trim()
  if (note) return note
  if (regionName) return `Find them around ${regionName}`
  return 'Location varies — see website for where to find them'
}
