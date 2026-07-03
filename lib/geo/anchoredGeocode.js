// ─────────────────────────────────────────────────────────────────────────────
// Anchored Australian geocoding.
//
// The problem this solves: "hard to address" places — nature reserves, islands,
// national parks, lighthouses, "via <town>" rural addresses — have no resolvable
// street address. Mapbox, asked to geocode a string like
// "Barunguba Montague Island Nature Reserve, Narooma NSW 2546", returns a
// LOW-RELEVANCE best-effort match, which is frequently a same-named STREET in a
// completely different region (e.g. a "Narooma Street" up in the Northern Rivers,
// ~900km from the actual town of Narooma on the far south coast). The pin then
// lands in the wrong region entirely.
//
// The fix: never trust an unvalidated geocode. Always compute a reliable
// LOCALITY ANCHOR first — the postcode (nationally unique, so unambiguous) or
// the suburb+state — and reject any precise result that lands implausibly far
// from that anchor. When the precise result is missing, low-confidence, or
// off-anchor, fall back to the anchor centroid: the pin lands in the right
// town / right region even when the exact building can't be resolved. That is
// the correct behaviour for a place with no street address — show its town,
// not a wrong-region street.
//
// Used by every path that assigns coordinates to a listing (candidate review
// geocode, admin listing edit, bulk re-geocode, the repair script).
// ─────────────────────────────────────────────────────────────────────────────

import { extractStateFromPlaceName } from './stateDerivation.js'

const MAPBOX_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

// A precise (full-address) result is trusted as the exact location only when it
// sits within this many km of the locality anchor. Generous enough that genuine
// rural venues (which can be tens of km from their postcode centroid) pass, but
// tight enough to reject same-named-street-in-wrong-region matches, which are
// always hundreds of km off. Catastrophic errors are the target, not metres.
export const ANCHOR_TRUST_KM = 50

// Below this Mapbox relevance, a precise result is treated as a guess and only
// accepted if it also corroborates the anchor (the distance gate still applies).
const MIN_PRECISE_RELEVANCE = 0.5

// ── Haversine distance (km) ──────────────────────────────────────────────────
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Postcode extraction ──────────────────────────────────────────────────────
// Pulls a 4-digit Australian postcode out of a free-text address. Prefers a
// postcode that follows a state token ("... NSW 2546"); falls back to a trailing
// 4-digit group, then an NT-style leading-zero postcode ("0822").
export function extractPostcode(address) {
  if (!address || typeof address !== 'string') return null
  const stateMatch = address.match(/\b(?:ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s*(\d{4})\b/i)
  if (stateMatch) return stateMatch[1]
  const trailing = address.match(/\b(\d{4})\b\s*(?:,?\s*Australia)?\s*$/i)
  if (trailing) return trailing[1]
  const nt = address.match(/\b(0\d{3})\b/)
  if (nt) return nt[1]
  return null
}

// ── Low-level Mapbox forward geocode ─────────────────────────────────────────
async function mapboxForward(query, { token, types, signal } = {}) {
  if (!query || !token) return null
  const typeParam = types ? `&types=${encodeURIComponent(types)}` : ''
  const url = `${MAPBOX_BASE}/${encodeURIComponent(query)}.json?country=au&limit=1${typeParam}&access_token=${token}`
  try {
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]
    if (!f) return null
    return {
      lat: f.center[1],
      lng: f.center[0],
      relevance: typeof f.relevance === 'number' ? f.relevance : 0,
      placeName: f.place_name || null,
      placeTypes: f.place_type || [],
    }
  } catch {
    return null
  }
}

// ── Locality anchor ──────────────────────────────────────────────────────────
// The trustworthy reference point. Postcode first (unique across Australia →
// never ambiguous), then suburb+state. Returns null only when neither resolves.
async function resolveAnchor({ postcode, suburb, state }, token) {
  if (postcode) {
    const byPostcode = await mapboxForward(
      `${postcode}${state ? `, ${state}` : ''}, Australia`,
      { token, types: 'postcode' }
    )
    if (byPostcode) return { ...byPostcode, kind: 'postcode' }
  }
  if (suburb) {
    const bySuburb = await mapboxForward(
      `${suburb}${state ? `, ${state}` : ''}, Australia`,
      { token, types: 'place,locality,neighborhood' }
    )
    if (bySuburb) return { ...bySuburb, kind: 'suburb' }
  }
  return null
}

/**
 * Geocode an Australian listing address with a locality anchor for safety.
 *
 * @param {Object} input
 * @param {string} [input.address]  Free-text street/landmark address.
 * @param {string} [input.suburb]   Suburb / town.
 * @param {string} [input.state]    State code (NSW, VIC, …).
 * @param {string} [input.postcode] Optional explicit postcode; otherwise parsed from address.
 * @param {Object} [opts]
 * @param {string} [opts.token]     Mapbox token (defaults to env).
 * @param {number} [opts.trustKm]   Override ANCHOR_TRUST_KM.
 * @returns {Promise<null | {
 *   lat: number, lng: number,
 *   precision: 'address' | 'postcode' | 'suburb' | 'address_unverified',
 *   relevance: number,
 *   anchorDistKm: number | null,   // distance from chosen point to the anchor
 *   placeName: string | null,
 *   anchorKind: 'postcode' | 'suburb' | null,
 *   derivedState: string | null,   // state parsed from the precise place_name, if any
 * }>}
 *
 * `precision` tells the caller how confident the placement is:
 *   - 'address'            → exact result, anchor-corroborated (best)
 *   - 'postcode'/'suburb'  → fell back to the locality centroid (right town/region)
 *   - 'address_unverified' → exact result with no anchor to validate against
 * Returns null only when nothing at all could be resolved.
 */
export async function anchoredGeocode(input, opts = {}) {
  const { address, suburb, state } = input
  const token = opts.token || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  const trustKm = opts.trustKm ?? ANCHOR_TRUST_KM
  if (!token) return null
  if (!address && !suburb) return null

  const postcode = input.postcode || extractPostcode(address)

  // 1. Reliable anchor.
  let anchor = await resolveAnchor({ postcode, suburb, state }, token)

  // 1b. When neither a postcode nor a suburb resolves, the address itself may be
  //     a bare locality (reviewer typed just "Melbourne"). A place/locality-typed
  //     lookup of it yields the town centroid — a trustworthy anchor that both
  //     rejects a same-named STREET (the distance gate below fires) and provides
  //     a correct fallback pin. Without this, "Melbourne, VIC" fuzzy-matched
  //     "Melbourne Street, New Berrima NSW" and dropped pins in the wrong region.
  if (!anchor && address) {
    const loc = await mapboxForward(`${address}${state ? `, ${state}` : ''}, Australia`, {
      token,
      types: 'place,locality,neighborhood',
    })
    if (loc) {
      const locState = extractStateFromPlaceName(loc.placeName)
      // Only trust it as an anchor when it doesn't contradict the given state.
      if (!state || !locState || locState === state) {
        anchor = { ...loc, kind: 'suburb' }
      }
    }
  }

  // 2. Precise full-address attempt.
  const precise = address
    ? await mapboxForward(`${address}${state ? `, ${state}` : ''}, Australia`, { token })
    : null

  const derivedState = precise ? extractStateFromPlaceName(precise.placeName) : null

  // 3. Trust the precise result only when it corroborates the anchor.
  if (precise) {
    const anchorDistKm = anchor ? haversineKm(precise.lat, precise.lng, anchor.lat, anchor.lng) : null
    const relevanceOk = precise.relevance >= MIN_PRECISE_RELEVANCE
    // A wrong-state result is always rejected. A null derivedState (couldn't
    // parse) is allowed through — the anchor-distance gate is the real guard.
    const stateOk = !state || !derivedState || derivedState === state

    if (anchor) {
      if (anchorDistKm <= trustKm && relevanceOk && stateOk) {
        return finalize(precise, 'address', anchorDistKm, anchor.kind, derivedState)
      }
      // Precise result is off-anchor / low-confidence / wrong-state → distrust it.
      // Fall through to the anchor centroid below.
    } else if (stateOk) {
      // No anchor to validate against (no postcode, suburb didn't resolve).
      // Return the precise result but mark it unverified so callers can flag it.
      return finalize(precise, 'address_unverified', null, null, derivedState)
    }
  }

  // 4. Fall back to the locality centroid — right town / right region. Derive
  //    the state from the ANCHOR's own place_name, not the (rejected) precise
  //    result — otherwise a distrusted wrong-region street would leak its state.
  if (anchor) {
    const anchorState = extractStateFromPlaceName(anchor.placeName)
    return finalize(anchor, anchor.kind === 'postcode' ? 'postcode' : 'suburb', 0, anchor.kind, anchorState)
  }

  return null
}

function finalize(point, precision, anchorDistKm, anchorKind, derivedState) {
  return {
    lat: point.lat,
    lng: point.lng,
    precision,
    relevance: point.relevance,
    anchorDistKm,
    placeName: point.placeName,
    anchorKind,
    derivedState,
  }
}
