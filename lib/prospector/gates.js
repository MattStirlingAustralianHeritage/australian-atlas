/**
 * Prospector Quality Gates
 *
 * Five sequential verification gates that every candidate must pass
 * before entering the review queue. Failure at any gate writes to
 * candidates_disqualified. Gates are independently testable.
 *
 * Gate 0 — Deduplication (free, runs first)
 * Gate 1 — Web Presence Verification
 * Gate 2 — Address and Region Verification
 * Gate 3 — Business Activity Verification
 * Gate 4 — Vertical Fit Classification
 */

// ─── Trigram Similarity (pure JS, no pg_trgm needed) ─────────

/**
 * Generate trigrams from a string for fuzzy matching.
 * Pads the string with spaces to capture start/end trigrams.
 */
function trigrams(str) {
  const s = `  ${str.toLowerCase().trim()}  `
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) {
    set.add(s.slice(i, i + 3))
  }
  return set
}

/**
 * Calculate trigram similarity between two strings.
 * Returns a value between 0 and 1 (1 = identical).
 */
export function trigramSimilarity(a, b) {
  if (!a || !b) return 0
  const tA = trigrams(a)
  const tB = trigrams(b)
  let intersection = 0
  for (const t of tA) {
    if (tB.has(t)) intersection++
  }
  const union = tA.size + tB.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ─── State Bounding Boxes ────────────────────────────────────

const STATE_BOUNDS = {
  NSW: { minLat: -37.5, maxLat: -28.2, minLng: 141.0, maxLng: 153.6 },
  VIC: { minLat: -39.2, maxLat: -34.0, minLng: 140.9, maxLng: 150.0 },
  QLD: { minLat: -29.2, maxLat: -10.7, minLng: 138.0, maxLng: 153.5 },
  SA:  { minLat: -38.1, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
  WA:  { minLat: -35.2, maxLat: -13.7, minLng: 112.9, maxLng: 129.0 },
  TAS: { minLat: -43.7, maxLat: -39.6, minLng: 143.8, maxLng: 148.4 },
  ACT: { minLat: -35.9, maxLat: -35.1, minLng: 148.7, maxLng: 149.4 },
  NT:  { minLat: -26.0, maxLat: -10.9, minLng: 129.0, maxLng: 138.0 },
}

// Australia-wide bounding box (used when no state specified)
const AUSTRALIA_BOUNDS = { minLat: -44.0, maxLat: -10.0, minLng: 112.0, maxLng: 154.0 }

// ─── Vertical Definitions ────────────────────────────────────

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas — artisan food & drink producers (distillers, brewers, providores, farmgate, small-scale makers of condiments/preserves/oils). NOT restaurants, NOT cafes, NOT retail shops, NOT farms without a consumer product.',
  collection: 'Culture Atlas — art museums, public galleries, science centres, discovery centres, curated private collections, sculpture parks, art archives, cultural heritage collections, natural history museums. NOT tourism info centres, NOT commercial theme parks, NOT venues where collections are incidental to the primary purpose.',
  craft: 'Craft Atlas — working maker studios, artisan workshops, ceramicists, woodworkers, glassblowers, textile artists, jewellery makers with studio practice. NOT retail-only shops, NOT factory showrooms, NOT mass manufacturers.',
  fine_grounds: 'Fine Grounds Atlas — specialty coffee roasters who roast their own beans. NOT cafes that only serve coffee, NOT tea shops, NOT general food retailers.',
  rest: 'Rest Atlas — boutique accommodation, independent hotels, B&Bs, farm stays, eco-lodges, glamping. NOT chain hotels, NOT caravan parks, NOT hostels.',
  field: 'Field Atlas — nature reserves, national parks, walking trails, wildlife sanctuaries, botanical gardens, outdoor adventure operators. NOT indoor attractions, NOT urban parks, NOT commercial theme parks.',
  corner: 'Corner Atlas — independent retail shops, bookshops, homewares, design stores, concept stores. NOT chain stores, NOT franchises, NOT online-only retailers.',
  found: 'Found Atlas — vintage shops, antique dealers, secondhand stores, salvage yards, op shops with curated stock. NOT charity bins, NOT bulk secondhand, NOT pawn shops.',
  table: 'Table Atlas — independent restaurants, cafes, dining venues, food trucks with a fixed location. NOT chain restaurants, NOT fast food, NOT catering-only, NOT pubs without notable food.',
}

// ─── Helper: strip HTML to plain text ────────────────────────

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ═══════════════════════════════════════════════════════════════
// GATE 0 — Deduplication
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a candidate is a duplicate of an existing listing or
 * a previously reviewed candidate.
 *
 * @param {object} candidate - { name, website_url, vertical }
 * @param {object} supabase - Supabase admin client
 * @returns {{ pass: boolean, reason?: string, details?: object }}
 */
export async function gate0Dedup(candidate, supabase) {
  const candidateName = candidate.name?.toLowerCase().trim()
  if (!candidateName) {
    return { pass: false, reason: 'No name provided' }
  }

  // 1. Exact name match across all listings in master DB
  const { data: exactMatches } = await supabase
    .from('listings')
    .select('name, vertical')
    .ilike('name', candidateName)
    .limit(5)

  if (exactMatches?.length > 0) {
    const match = exactMatches[0]
    return {
      pass: false,
      reason: `Already listed — ${match.name} on ${match.vertical}`,
      details: { matchType: 'exact_name', matchedName: match.name, matchedVertical: match.vertical },
    }
  }

  // 2. Fuzzy name match >85% against listings
  //    Fetch a broader set and check in-memory (more efficient than pg_trgm for this use case)
  const { data: allListings } = await supabase
    .from('listings')
    .select('name, vertical')
    .eq('status', 'active')
    .limit(10000)

  if (allListings) {
    for (const listing of allListings) {
      const sim = trigramSimilarity(candidateName, listing.name)
      if (sim > 0.85) {
        return {
          pass: false,
          reason: `Already listed — ${listing.name} on ${listing.vertical} (${Math.round(sim * 100)}% match)`,
          details: { matchType: 'fuzzy_name', similarity: sim, matchedName: listing.name, matchedVertical: listing.vertical },
        }
      }
    }
  }

  // 3. URL match against existing listings
  if (candidate.website_url) {
    const normalizedUrl = candidate.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()

    const { data: urlMatches } = await supabase
      .from('listings')
      .select('name, vertical, website')
      .not('website', 'is', null)
      .eq('status', 'active')
      .limit(10000)

    if (urlMatches) {
      for (const listing of urlMatches) {
        if (!listing.website) continue
        const listingUrl = listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
        if (listingUrl === normalizedUrl) {
          return {
            pass: false,
            reason: `Already listed — ${listing.name} on ${listing.vertical} (URL match)`,
            details: { matchType: 'url', matchedName: listing.name, matchedVertical: listing.vertical },
          }
        }
      }
    }
  }

  // 4. Check previously reviewed candidates (approved, rejected, disqualified)
  const { data: previousCandidates } = await supabase
    .from('listing_candidates')
    .select('name, status, reviewed_at')
    .or(`status.eq.converted,status.eq.rejected`)
    .limit(10000)

  if (previousCandidates) {
    for (const prev of previousCandidates) {
      const sim = trigramSimilarity(candidateName, prev.name)
      if (sim > 0.85) {
        const outcome = prev.status === 'converted' ? 'approved' : prev.status
        const date = prev.reviewed_at ? new Date(prev.reviewed_at).toISOString().split('T')[0] : 'unknown date'
        return {
          pass: false,
          reason: `Previously reviewed — ${outcome} on ${date}`,
          details: { matchType: 'previous_candidate', similarity: sim, previousStatus: prev.status, reviewedAt: prev.reviewed_at },
        }
      }
    }
  }

  // 5. Check previously disqualified candidates
  const { data: disqualified } = await supabase
    .from('candidates_disqualified')
    .select('name, reason, created_at')
    .limit(10000)

  if (disqualified) {
    for (const dq of disqualified) {
      const sim = trigramSimilarity(candidateName, dq.name)
      if (sim > 0.85) {
        const date = dq.created_at ? new Date(dq.created_at).toISOString().split('T')[0] : 'unknown date'
        return {
          pass: false,
          reason: `Previously disqualified on ${date} — ${dq.reason}`,
          details: { matchType: 'previously_disqualified', similarity: sim },
        }
      }
    }
  }

  // 6. Coordinate proximity check (within 100m = same place)
  if (candidate.lat && candidate.lng) {
    const { data: nearbyListings } = await supabase
      .from('listings')
      .select('name, vertical, lat, lng')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', candidate.lat - 0.01) // ~1.1km bounding box pre-filter
      .lte('lat', candidate.lat + 0.01)
      .gte('lng', candidate.lng - 0.01)
      .lte('lng', candidate.lng + 0.01)
      .limit(20)

    if (nearbyListings) {
      for (const listing of nearbyListings) {
        const dist = haversineMeters(candidate.lat, candidate.lng, listing.lat, listing.lng)
        if (dist < 100) {
          return {
            pass: false,
            reason: `Already listed — ${listing.name} on ${listing.vertical} (${Math.round(dist)}m away)`,
            details: { matchType: 'coordinate_proximity', matchedName: listing.name, matchedVertical: listing.vertical, distance: dist },
          }
        }
      }
    }
  }

  // Pass through Google Places metadata for scoring if available
  const gpData = candidate.google_places_data || {}
  return {
    pass: true,
    details: {
      matchType: 'none',
      source: candidate.source || 'unknown',
      googlePlacesStatus: gpData.business_status || null,
      googlePlacesRating: gpData.rating || null,
      googlePlacesRatingCount: gpData.rating_count || null,
    },
  }
}

// Haversine distance in meters
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}


// ═══════════════════════════════════════════════════════════════
// GATE 1 — Web Presence Verification
// ═══════════════════════════════════════════════════════════════

/**
 * Verify the candidate has a working website that references the business.
 *
 * @param {object} candidate - { name, website_url }
 * @returns {{ pass: boolean, reason?: string, details?: object, websiteText?: string }}
 */
export async function gate1WebPresence(candidate) {
  // ── Hard gate: no website = no listing (except exempt verticals) ──
  const WEBSITE_EXEMPT_VERTICALS = ['field']
  const isExempt = WEBSITE_EXEMPT_VERTICALS.includes(candidate.vertical)

  if (!candidate.website_url?.trim() && !isExempt) {
    return {
      pass: false,
      reason: 'No website URL — hard editorial gate (all non-Field Atlas listings require a verified website)',
      details: { urlChecked: null, httpStatus: null, gate: 'no_website' },
    }
  }

  // Determine URL to check
  let urlToCheck = candidate.website_url

  // Only try URL guessing for website-exempt verticals (e.g. Field Atlas — natural places)
  if (!urlToCheck && isExempt) {
    const slug = candidate.name
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '')
    const guesses = [
      `https://www.${slug}.com.au`,
      `https://${slug}.com.au`,
      `https://www.${slug}.com`,
    ]

    for (const guess of guesses) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(guess, {
          signal: controller.signal,
          headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-verification)' },
          redirect: 'follow',
        })
        clearTimeout(timeout)
        if (res.ok) {
          urlToCheck = guess
          break
        }
      } catch {
        // URL didn't work, try next
      }
    }
  }

  if (!urlToCheck) {
    return {
      pass: false,
      reason: 'No verifiable web presence',
      details: { urlChecked: null, httpStatus: null },
    }
  }

  // Fetch the URL
  let response, html
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    response = await fetch(urlToCheck, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-verification)' },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return {
        pass: false,
        reason: `No verifiable web presence — URL returned ${response.status}`,
        details: { urlChecked: urlToCheck, httpStatus: response.status },
      }
    }

    html = await response.text()
  } catch (err) {
    return {
      pass: false,
      reason: `No verifiable web presence — ${err.name === 'AbortError' ? 'timeout' : 'connection failed'}`,
      details: { urlChecked: urlToCheck, httpStatus: null, error: err.message },
    }
  }

  // ── Parked domain detection ──────────────────────────────
  const rawPageText = htmlToText(html)
  const pageText = rawPageText.toLowerCase()

  const PARKED_PATTERNS = [
    /this\s+domain\s+(?:is\s+)?for\s+sale/,
    /buy\s+this\s+domain/,
    /domain\s+(?:parking|is\s+parked)/,
    /godaddy[^a-z]*forsale/,
    /(?:sedo|afternic|hugedomains|dan)\.com/,
    /domain\s+may\s+be\s+for\s+sale/,
    /(?:this\s+page|this\s+site|website)\s+(?:is\s+)?(?:under\s+construction|coming\s+soon)/,
    /parked\s+(?:by|with|at)\s/,
  ]

  for (const pattern of PARKED_PATTERNS) {
    if (pattern.test(pageText)) {
      return {
        pass: false,
        reason: 'Website appears to be a parked domain or placeholder — not a real business website',
        details: { urlChecked: urlToCheck, httpStatus: response.status, gate: 'parked_domain' },
      }
    }
  }

  // ── Minimum content threshold ─────────────────────────────
  // Very short pages (<200 chars of text) are usually parking/placeholder pages
  if (rawPageText.length < 200) {
    return {
      pass: false,
      reason: `Website has minimal content (${rawPageText.length} chars) — likely a placeholder or parking page`,
      details: { urlChecked: urlToCheck, httpStatus: response.status, contentLength: rawPageText.length, gate: 'thin_content' },
    }
  }

  // Check that the page references the business name (fuzzy match >80%)
  const nameWords = candidate.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  // Count how many significant name words appear in the page
  let matchedWords = 0
  for (const word of nameWords) {
    if (pageText.includes(word)) matchedWords++
  }

  const nameMatchRatio = nameWords.length > 0 ? matchedWords / nameWords.length : 0

  if (nameMatchRatio < 0.8) {
    return {
      pass: false,
      reason: `No verifiable web presence — website does not reference business name (${Math.round(nameMatchRatio * 100)}% word match)`,
      details: { urlChecked: urlToCheck, httpStatus: response.status, nameMatchRatio },
    }
  }

  // Extract useful headers for Gate 3
  const lastModified = response.headers.get('last-modified') || null

  return {
    pass: true,
    details: {
      urlChecked: urlToCheck,
      httpStatus: response.status,
      nameMatchRatio,
      lastModified,
      contentLength: rawPageText.length,
    },
    websiteUrl: urlToCheck,
    websiteText: rawPageText.slice(0, 8000),
    lastModified,
  }
}


// ═══════════════════════════════════════════════════════════════
// GATE 2 — Address and Region Verification
// ═══════════════════════════════════════════════════════════════

/**
 * Extract and geocode a physical address from the website, then verify
 * the location falls within the expected region/state.
 *
 * @param {object} candidate - { name, region, website_url }
 * @param {string} websiteText - Plain text extracted from verified website
 * @param {object} options - { mapboxToken }
 * @returns {{ pass: boolean, reason?: string, details?: object }}
 */
export async function gate2AddressRegion(candidate, websiteText, options = {}) {
  const mapboxToken = options.mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

  if (!mapboxToken) {
    // If no Mapbox token available, pass with a warning (non-blocking in dev)
    return {
      pass: true,
      details: { warning: 'No Mapbox token — address verification skipped', geocodeConfidence: null },
    }
  }

  // Build a geocode query from what we know
  const parts = [candidate.name, candidate.region, 'Australia'].filter(Boolean)
  const query = parts.join(', ')

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${mapboxToken}`
    const res = await fetch(url)
    if (!res.ok) {
      return {
        pass: true,
        details: { warning: `Mapbox returned ${res.status} — address verification skipped`, geocodeConfidence: null },
      }
    }

    const data = await res.json()
    const feature = data.features?.[0]

    if (!feature) {
      return {
        pass: false,
        reason: `Address resolves to no location — could not geocode "${query}"`,
        details: { query, geocodeConfidence: null },
      }
    }

    const lat = feature.center[1]
    const lng = feature.center[0]
    const relevance = feature.relevance || 0
    const placeType = feature.place_type?.[0] || 'unknown'

    // Relevance below 0.6 is too low confidence
    if (relevance < 0.6) {
      return {
        pass: false,
        reason: `Address resolves to low-confidence location (${Math.round(relevance * 100)}% relevance)`,
        details: { query, lat, lng, relevance, placeType, geocodeConfidence: 'low' },
      }
    }

    // Extract state from region string if possible (e.g., "Barossa Valley, SA" or "Lorne, VIC")
    const stateMatch = candidate.region?.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/i)
    const expectedState = stateMatch ? stateMatch[1].toUpperCase() : null

    // Verify the point is within Australia
    const auBounds = AUSTRALIA_BOUNDS
    if (lat < auBounds.minLat || lat > auBounds.maxLat || lng < auBounds.minLng || lng > auBounds.maxLng) {
      return {
        pass: false,
        reason: `Address resolves outside Australia (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        details: { query, lat, lng, relevance, geocodeConfidence: 'outside_australia' },
      }
    }

    // If we know the expected state, verify the point is within that state's bounds
    if (expectedState && STATE_BOUNDS[expectedState]) {
      const b = STATE_BOUNDS[expectedState]
      if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) {
        // Find which state it actually falls in
        let actualState = null
        for (const [state, bounds] of Object.entries(STATE_BOUNDS)) {
          if (lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng) {
            actualState = state
            break
          }
        }
        return {
          pass: false,
          reason: `Address resolves to ${actualState || 'unknown location'}, not ${expectedState} (${candidate.region})`,
          details: { query, lat, lng, relevance, expectedState, actualState, geocodeConfidence: 'wrong_region' },
        }
      }
    }

    const geocodeConfidence = relevance >= 0.9 ? 'exact' : 'high'
    const placeName = feature.place_name || query

    return {
      pass: true,
      details: {
        query,
        lat,
        lng,
        relevance,
        placeType,
        placeName,
        geocodeConfidence,
        expectedState,
      },
    }
  } catch (err) {
    // Geocoding failure is non-fatal — pass with warning
    return {
      pass: true,
      details: { warning: `Geocoding error: ${err.message}`, geocodeConfidence: null },
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// GATE 3 — Business Activity Verification
// ═══════════════════════════════════════════════════════════════

/**
 * Confirm the business is currently operating via at least one signal:
 * - Website Last-Modified header within 12 months
 * - Active opening hours mentioned on website
 * - Social media activity indicators
 * - Active online store
 *
 * @param {object} candidate - { name }
 * @param {string} websiteText - Plain text from verified website
 * @param {string|null} lastModified - Last-Modified header value
 * @returns {{ pass: boolean, reason?: string, details?: object }}
 */
export async function gate3BusinessActivity(candidate, websiteText, lastModified) {
  const signals = []
  const textLower = (websiteText || '').toLowerCase()

  // Signal 1: Last-Modified header is recent (within 12 months)
  if (lastModified) {
    try {
      const modDate = new Date(lastModified)
      const monthsAgo = (Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAgo <= 12) {
        signals.push({ type: 'last_modified', detail: `Website updated ${Math.round(monthsAgo)} months ago` })
      }
    } catch {
      // Invalid date, skip
    }
  }

  // Signal 2: Opening hours mentioned
  const hoursPatterns = [
    /open\s*(?:mon|tue|wed|thu|fri|sat|sun)/i,
    /opening\s*hours/i,
    /hours\s*of\s*operation/i,
    /\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i,
    /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i,
    /daily\s*\d/i,
    /(?:open|closed)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|daily|weekdays|weekends)/i,
  ]
  const hasHours = hoursPatterns.some(p => p.test(textLower))
  if (hasHours) {
    signals.push({ type: 'opening_hours', detail: 'Active opening hours on website' })
  }

  // Signal 3: Social media indicators
  const socialPatterns = [
    /instagram\.com\//i,
    /facebook\.com\//i,
    /@\w{3,}/,
    /follow\s+us/i,
    /social\s*media/i,
    /tiktok\.com\//i,
  ]
  const hasSocial = socialPatterns.some(p => p.test(textLower))
  if (hasSocial) {
    signals.push({ type: 'social_media', detail: 'Social media presence detected' })
  }

  // Signal 4: Online store / booking indicators
  const commercePatterns = [
    /add\s*to\s*cart/i,
    /shop\s*now/i,
    /book\s*(?:now|online|a\s*table|a\s*tour|a\s*room)/i,
    /buy\s*now/i,
    /order\s*(?:now|online)/i,
    /checkout/i,
    /online\s*(?:shop|store|booking)/i,
    /reservation/i,
  ]
  const hasCommerce = commercePatterns.some(p => p.test(textLower))
  if (hasCommerce) {
    signals.push({ type: 'online_store', detail: 'Active online store or booking system' })
  }

  // Signal 5: Recent date references (e.g., current year, "2025", "2026")
  const currentYear = new Date().getFullYear()
  const recentYears = [currentYear, currentYear - 1]
  const hasRecentDate = recentYears.some(y => textLower.includes(String(y)))
  if (hasRecentDate) {
    signals.push({ type: 'recent_date', detail: `References ${currentYear} or ${currentYear - 1}` })
  }

  // Signal 6: Contact information present
  const hasPhone = /(?:\+61|0[2-9])\s*\d[\d\s]{6,}/i.test(textLower)
  const hasEmail = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(textLower)
  if (hasPhone || hasEmail) {
    signals.push({ type: 'contact_info', detail: `${hasPhone ? 'Phone' : ''}${hasPhone && hasEmail ? ' and ' : ''}${hasEmail ? 'email' : ''} listed` })
  }

  if (signals.length === 0) {
    return {
      pass: false,
      reason: 'No confirmed activity signal — business may be closed or dormant',
      details: { signals: [], signalCount: 0 },
    }
  }

  return {
    pass: true,
    details: { signals, signalCount: signals.length },
  }
}


// ═══════════════════════════════════════════════════════════════
// GATE 4 — Vertical Fit Classification
// ═══════════════════════════════════════════════════════════════

/**
 * Use Claude to confirm whether the business belongs in the target vertical.
 *
 * @param {object} candidate - { name, vertical, region }
 * @param {string} websiteText - Plain text from verified website
 * @param {object} options - { anthropicApiKey }
 * @returns {{ pass: boolean, reason?: string, details?: object, wrongVertical?: object }}
 */
export async function gate4VerticalFit(candidate, websiteText, options = {}) {
  const apiKey = options.anthropicApiKey || process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // No API key — fail-closed: cannot verify vertical fit without AI
    return {
      pass: false,
      reason: 'No Anthropic API key — vertical fit cannot be verified',
      details: { warning: 'Missing API key', confidence: null },
    }
  }

  const verticalLabel = VERTICAL_LABELS[candidate.vertical] || candidate.vertical
  const allVerticals = Object.entries(VERTICAL_LABELS)
    .map(([key, label]) => `${key}: ${label}`)
    .join('\n')

  const prompt = `You are a strict classifier for a curated Australian directory network. Be CONSERVATIVE — only approve businesses that are an unambiguous, clear fit. When in doubt, reject.

BUSINESS: ${candidate.name}
${candidate.region ? `REGION: ${candidate.region}` : ''}
TARGET VERTICAL: ${candidate.vertical} (${verticalLabel})

WEBSITE CONTENT (first 4000 chars):
${(websiteText || '').slice(0, 4000) || '[NO WEBSITE CONTENT AVAILABLE — classify from name only, be extra cautious]'}

ALL AVAILABLE VERTICALS:
${allVerticals}

RULES:
- Read each vertical description carefully, including the "NOT" exclusions
- If the business name alone is ambiguous and there is no website content, set confidence below 0.7
- Government-run facilities, visitor centres, and tourism information centres rarely fit any vertical
- Chain businesses, franchises, and mass-market operations do not fit any vertical
- The business must be independently owned/operated to qualify

TASK: Does this business genuinely belong in the "${candidate.vertical}" vertical?

Respond with ONLY a JSON object:
{
  "belongs_in_target": true/false,
  "confidence": 0.0 to 1.0,
  "justification": "One sentence explaining why",
  "suggested_vertical": "vertical_key if it belongs elsewhere, null if it fits the target"
}

Return ONLY valid JSON, no markdown fences.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      // API error — fail-closed: cannot verify vertical fit
      return {
        pass: false,
        reason: `Claude API returned ${res.status} — vertical fit unverified`,
        details: { warning: `API error ${res.status}`, confidence: null },
      }
    }

    const result = await res.json()
    const text = (result.content?.[0]?.text || '').trim()

    let classification
    try {
      const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '')
      classification = JSON.parse(jsonStr)
    } catch {
      // Parse error — fail-closed: cannot verify vertical fit
      return {
        pass: false,
        reason: 'Could not parse vertical fit response — unverified',
        details: { warning: 'Response parse failed', confidence: null, rawResponse: text.slice(0, 200) },
      }
    }

    const confidence = parseFloat(classification.confidence) || 0
    const justification = classification.justification || 'No justification provided'

    // Extra penalty: if no website content, the LLM is guessing from name only — apply stricter threshold
    const hasWebContent = !!(websiteText && websiteText.trim().length > 50)
    const effectiveThreshold = hasWebContent ? 0.85 : 0.90

    // If clearly belongs in a different vertical
    if (!classification.belongs_in_target && classification.suggested_vertical) {
      return {
        pass: false,
        reason: `Wrong vertical — likely belongs in ${classification.suggested_vertical} (${justification})`,
        details: {
          confidence,
          justification,
          belongsInTarget: false,
          suggestedVertical: classification.suggested_vertical,
        },
        wrongVertical: {
          name: candidate.name,
          detected_vertical: candidate.vertical,
          suggested_vertical: classification.suggested_vertical,
          justification,
          url: candidate.website_url || null,
          region: candidate.region || null,
        },
      }
    }

    // Low confidence — disqualify (stricter when no website content)
    if (confidence < effectiveThreshold) {
      return {
        pass: false,
        reason: `Low vertical fit confidence — ${justification} (${Math.round(confidence * 100)}%)`,
        details: {
          confidence,
          justification,
          belongsInTarget: classification.belongs_in_target,
        },
      }
    }

    return {
      pass: true,
      details: {
        confidence,
        justification,
        belongsInTarget: true,
      },
    }
  } catch (err) {
    // Network error — fail-closed: cannot verify vertical fit
    return {
      pass: false,
      reason: `Vertical fit check failed: ${err.message}`,
      details: { warning: `Network error: ${err.message}`, confidence: null },
    }
  }
}
