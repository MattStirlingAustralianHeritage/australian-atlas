// ============================================================
// Discover — heuristic taste-reflection (§4 of the rebuild spec).
//
// A short, TRUE sentence reflecting what the user keeps choosing,
// derived purely from structured fields already on `listings`
// (vertical, region/state, presence_type). No LLM.
//
// Used (a) as the highest-converting sign-in copy on the Discover wall
// and (b) — reusably — by the later logged-in homepage rail. Hence a
// standalone function, not inline.
//
// HONESTY RULE (load-bearing): never assert a pattern the picks don't
// support. If no dominant pattern exists, fall back to the neutral
// "Sign in to keep your places." A wrong mirror is worse than a generic
// one. Priority: vertical concentration → region concentration →
// presence pattern.
// ============================================================

// Reflection-friendly plurals (the brand labels in verticalUrl are titles,
// not natural plurals). Kept here so the copy reads like a person wrote it.
const VERTICAL_PLURAL = {
  sba: 'small-batch drink producers',
  collection: 'galleries and museums',
  craft: 'maker studios',
  fine_grounds: 'specialty coffee roasters',
  rest: 'boutique stays',
  field: 'wild places',
  corner: 'independent shops',
  found: 'vintage and antique finds',
  table: 'independent food places',
  way: 'guided experiences',
}

// presence_type values that genuinely mean "you have to seek it out".
// 'permanent' and 'seasonal' do NOT qualify (a seasonal venue is still a
// fixed place when open). See migration 087.
const SEEK_OUT_PRESENCE = new Set(['by_appointment', 'markets', 'mobile', 'online'])

const VALUE_LINE = 'Sign in to keep your taste and get a homepage that learns it.'
const NEUTRAL_LINE = 'Sign in to keep your places.'

// The wall shows the reflection only once there's enough positive signal
// to say something true.
export const REFLECTION_MIN_SWIPES = 6
export const REFLECTION_MIN_PICKS = 3

export function shouldShowReflection(swipeCount, pickCount) {
  return swipeCount >= REFLECTION_MIN_SWIPES && pickCount >= REFLECTION_MIN_PICKS
}

function topEntry(counts) {
  let key = null
  let count = 0
  for (const [k, v] of Object.entries(counts)) {
    if (v > count) {
      key = k
      count = v
    }
  }
  return { key, count }
}

/**
 * Derive a taste reflection from the picked listings.
 *
 * @param {Array<{vertical?:string, region?:string, state?:string, presence_type?:string}>} picks
 * @returns {{
 *   hasPattern: boolean,
 *   descriptor: string|null,   // the true sentence about their taste (no CTA), or null
 *   cta: string,               // the value line to append / show
 *   full: string,              // descriptor + ' ' + cta, or the neutral line alone
 *   dominant: { vertical:string|null, region:string|null, presence:boolean }
 * }}
 */
export function deriveTasteReflection(picks = []) {
  const total = picks.length
  const neutral = {
    hasPattern: false,
    descriptor: null,
    cta: NEUTRAL_LINE,
    full: NEUTRAL_LINE,
    dominant: { vertical: null, region: null, presence: false },
  }
  if (total === 0) return neutral

  // ── Tally structured fields ────────────────────────────────────────
  const verticalCounts = {}
  const regionCounts = {}
  let seekCount = 0
  for (const p of picks) {
    if (p.vertical) verticalCounts[p.vertical] = (verticalCounts[p.vertical] || 0) + 1
    const region = (p.region || '').trim()
    if (region) regionCounts[region] = (regionCounts[region] || 0) + 1
    if (p.presence_type && SEEK_OUT_PRESENCE.has(p.presence_type)) seekCount += 1
  }

  const topVertical = topEntry(verticalCounts)
  const topRegion = topEntry(regionCounts)

  // Shares are over ALL picks (a pick with a missing field counts against the
  // pattern's strength — honest, not flattering).
  const verticalShare = topVertical.count / total
  const regionShare = topRegion.count / total
  const seekShare = seekCount / total

  const strongVertical = topVertical.count >= 2 && verticalShare >= 0.5
  const tightRegion = topRegion.count >= 2 && regionShare >= 0.5
  const seekOut = seekCount >= 2 && seekShare >= 0.5
  const strongSeekOut = seekCount >= 3 && seekShare >= 0.6

  const verticalPlural = strongVertical
    ? VERTICAL_PLURAL[topVertical.key] || 'independent places'
    : null

  // ── Build the most specific TRUE descriptor (priority order) ────────
  let descriptor = null
  const dominant = {
    vertical: strongVertical ? topVertical.key : null,
    region: tightRegion ? topRegion.key : null,
    presence: seekOut,
  }

  if (strongVertical && tightRegion) {
    descriptor = `You keep choosing ${verticalPlural} across ${topRegion.key}.`
  } else if (strongVertical) {
    descriptor = `You keep choosing ${verticalPlural}.`
  } else if (tightRegion) {
    descriptor = `Your taste is running toward ${topRegion.key}.`
  } else if (strongSeekOut) {
    // No vertical/region concentration, but the picks are genuinely the
    // seek-out kind — still a true, specific read.
    descriptor = 'You keep choosing places you have to seek out.'
    dominant.presence = true
  }

  if (!descriptor) return neutral

  // Presence addendum — only when it genuinely supports it AND we haven't
  // already made it the whole descriptor.
  if (seekOut && !descriptor.includes('seek out')) {
    descriptor = descriptor.replace(/\.$/, '') + ', and ones you have to seek out.'
  }

  return {
    hasPattern: true,
    descriptor,
    cta: VALUE_LINE,
    full: `${descriptor} ${VALUE_LINE}`,
    dominant,
  }
}
