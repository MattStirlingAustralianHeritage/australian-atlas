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

// The non-permanent presence modes a listing can hold, in PRIORITY order — the
// same order (and the same meaning) as PRESENCE_SUBTYPE_OPTIONS in
// /admin/candidates. A listing may operate in several at once, so the full set
// lives in `presence_types` (migration 200) while `presence_type` stays the
// scalar primary every downstream consumer reads (search, place pages, trail
// eligibility, embeddings). by_appointment ranks first so a maker who also
// takes visits keeps its trail eligibility (`presence_type.eq.by_appointment`).
export const PRESENCE_SUBTYPES = ['by_appointment', 'markets', 'online', 'seasonal']

/** The listing's presence modes as a clean, canonically ordered array. Legacy
 *  rows predate `presence_types` and carry only the scalar, so it is folded in. */
function presenceSubtypes(listing) {
  const set = new Set(
    (Array.isArray(listing?.presence_types) ? listing.presence_types : [])
      .filter(v => PRESENCE_SUBTYPES.includes(v))
  )
  if (PRESENCE_SUBTYPES.includes(listing?.presence_type)) set.add(listing.presence_type)
  return PRESENCE_SUBTYPES.filter(v => set.has(v))
}

/** True when this listing welcomes visits by arrangement. Reads BOTH columns:
 *  a maker who sells at markets AND takes studio visits has presence_type
 *  'by_appointment' (it wins the priority order), but one who is primarily
 *  something else can still carry it in the array. */
export function isByAppointment(listing) {
  return presenceSubtypes(listing).includes('by_appointment')
}

/**
 * Turn the "by appointment" switch on or off, returning the coherent
 * `{ presence_type, presence_types }` pair to write. This is the ONLY place
 * that decides how the scalar and the array move together — the admin Listing
 * Editor and the operator dashboard both go through it, so the two columns can
 * never contradict each other.
 *
 * Switching it off drops back to whatever other mode the listing still has
 * (markets, online, seasonal); with nothing left it returns to 'permanent' —
 * except for a mobile venue, which keeps 'mobile' (a food truck's presence is
 * about having no fixed address, not about appointments).
 */
export function setByAppointment(on, listing) {
  const current = presenceSubtypes(listing)
  const next = on
    ? [...new Set([...current, 'by_appointment'])]
    : current.filter(v => v !== 'by_appointment')
  const ordered = PRESENCE_SUBTYPES.filter(v => next.includes(v))
  if (ordered.length === 0) {
    return {
      presence_type: listing?.presence_type === 'mobile' ? 'mobile' : 'permanent',
      presence_types: null,
    }
  }
  return { presence_type: ordered[0], presence_types: ordered }
}

/**
 * Normalise a `{ presence_type, presence_types }` pair before it is written.
 * `presence_types` is dropped for the visitable-by-default modes (permanent /
 * mobile carry their whole meaning in the scalar) and otherwise reduced to the
 * canonical, deduped set that always contains the scalar.
 */
export function normalisePresencePair(presenceType, presenceTypes) {
  const scalar = presenceType || 'permanent'
  if (!PRESENCE_SUBTYPES.includes(scalar)) {
    return { presence_type: scalar, presence_types: null }
  }
  const ordered = presenceSubtypes({ presence_type: scalar, presence_types: presenceTypes })
  return { presence_type: scalar, presence_types: ordered }
}

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

/** True when a listing has a precise, mappable point worth showing as a dot on
 *  a map. It must have coordinates, be a real physical place to visit
 *  (`visitable !== false`), and not have its exact location suppressed
 *  (address-on-request or mobile). Locality-only makers — a jeweller "in Sydney"
 *  whose lat/lng is just the city centroid, or an online/markets maker — are
 *  marked `visitable = false`, so this returns false and no misleading dot is
 *  drawn. This is the single gate every map surface should use (the `map_pins`
 *  and `nearby_listings` RPCs apply the equivalent SQL filter). */
export function hasPreciseLocation(listing) {
  if (!listing) return false
  if (listing.lat == null || listing.lng == null) return false
  if (listing.visitable === false) return false
  if (hideExactLocation(listing)) return false
  return true
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
