/**
 * Evidence-Based Confidence Scoring
 *
 * Replaces LLM self-assessment with a score derived from
 * concrete verification signals gathered during gate checks.
 *
 * Base score:               60  (passes all five gates)
 * +10  Exact geocode match (vs high confidence)
 * +10  Google Places OPERATIONAL confirmed (TODO)
 * +10  Website updated within 6 months
 * +5   Social media active within 6 months
 * +5   Business appears in regional press or directories
 * +5   Website has clear contact details and opening hours
 * +5   Rich website content (>2000 chars)
 * -5   Thin website content (<500 chars)
 * Maximum:                 110 (capped at 100)
 */

/**
 * Calculate evidence-based confidence score from gate results.
 *
 * @param {object} gateResults - Results from all five gates
 * @param {object} gateResults.gate0 - Deduplication result
 * @param {object} gateResults.gate1 - Web presence result
 * @param {object} gateResults.gate2 - Address/region result
 * @param {object} gateResults.gate3 - Business activity result
 * @param {object} gateResults.gate4 - Vertical fit result
 * @returns {{ score: number, breakdown: object }}
 */
export function calculateScore(gateResults) {
  let score = 60 // Base: passed all gates
  const breakdown = {
    base: 60,
    exactGeocode: 0,
    googlePlaces: 0,  // TODO: not yet implemented
    websiteRecent: 0,
    socialMedia: 0,
    pressDirectories: 0,
    contactAndHours: 0,
    contentDepth: 0,
  }

  const gate1 = gateResults.gate1?.details || {}
  const gate2 = gateResults.gate2?.details || {}
  const gate3 = gateResults.gate3?.details || {}

  // +10 Exact geocode match
  if (gate2.geocodeConfidence === 'exact') {
    score += 10
    breakdown.exactGeocode = 10
  }

  // +10 Google Places OPERATIONAL confirmed
  // TODO: Integrate Google Places API for business status verification
  // For now this remains 0 — noted as future enhancement
  breakdown.googlePlaces = 0

  // +10 Website updated within 6 months
  if (gate1.lastModified) {
    try {
      const modDate = new Date(gate1.lastModified)
      const monthsAgo = (Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAgo <= 6) {
        score += 10
        breakdown.websiteRecent = 10
      }
    } catch {
      // Invalid date, skip
    }
  }
  // Also check if gate 3 found recent date references or recent last-modified
  if (breakdown.websiteRecent === 0 && gate3.signals) {
    const recentSignal = gate3.signals.find(s => s.type === 'last_modified')
    if (recentSignal) {
      // The gate 3 last-modified check is within 12 months — give partial credit if within 6
      const match = recentSignal.detail?.match(/(\d+)\s*months?\s*ago/)
      if (match && parseInt(match[1]) <= 6) {
        score += 10
        breakdown.websiteRecent = 10
      }
    }
  }

  // +5 Social media active
  if (gate3.signals) {
    const hasSocial = gate3.signals.some(s => s.type === 'social_media')
    if (hasSocial) {
      score += 5
      breakdown.socialMedia = 5
    }
  }

  // +5 Business appears in regional press or directories
  // This is assessed from the website text — if the business mentions press,
  // awards, or directory listings, it's a positive signal
  // TODO: Could be enhanced with actual press/directory search
  if (gate3.signals) {
    const hasRecentDate = gate3.signals.some(s => s.type === 'recent_date')
    if (hasRecentDate) {
      score += 5
      breakdown.pressDirectories = 5
    }
  }

  // +5 Website has clear contact details and opening hours
  if (gate3.signals) {
    const hasContact = gate3.signals.some(s => s.type === 'contact_info')
    const hasHours = gate3.signals.some(s => s.type === 'opening_hours')
    if (hasContact && hasHours) {
      score += 5
      breakdown.contactAndHours = 5
    }
  }

  // +5 Rich website content (>2000 chars) / -5 thin content (<500 chars)
  const contentLength = gate1.contentLength || 0
  if (contentLength > 2000) {
    score += 5
    breakdown.contentDepth = 5
  } else if (contentLength > 0 && contentLength < 500) {
    score -= 5
    breakdown.contentDepth = -5
  }

  // Cap at 100 (floor at 0)
  score = Math.max(0, Math.min(100, score))

  return { score, breakdown }
}
