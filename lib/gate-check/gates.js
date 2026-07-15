/**
 * Gate Check — quality gates adapted for LIVE listings.
 *
 * These are the same four verification gates the prospector applies to NEW
 * candidates (lib/prospector/gates.js), re-tuned to run retroactively over the
 * live Atlas without flagging half of it:
 *
 *   Gate 1 — Web Presence : only listings that HAVE a website are checked; a
 *             missing website is allowed (many curated listings legitimately
 *             have none). A listing fails only when its EXISTING site is
 *             dead / parked / thin / points at an unrelated business.
 *   Gate 2 — Location     : coordinates outside Australia, at null-island (0,0),
 *             or in a different state than the listing's `state` column (with a
 *             ~0.2° border buffer so genuine border towns are spared).
 *   Gate 3 — Activity     : a reachable site with zero operating signals.
 *   Gate 4 — Vertical Fit : the name matches a service-trade disqualifier
 *             (glazier, plumber, …). Reuses the gate-review classifier.
 *
 * PURE MODULE — no `@/` alias, no DB, no network except the explicit fetch in
 * checkGate1Web(). Safe to import from both a Next.js route and a plain-node
 * sweep script (via a relative path).
 *
 * Every check returns null (pass) or a failure descriptor:
 *   { gate, code, severity: 1|2|3, reason }   (+ http_status on gate1)
 */

import { classifyListing, SERVICE_TRADE_DISQUALIFIERS } from '../gate/classify.js'

// ─── State bounding boxes (identical to lib/prospector/gates.js) ─────────────
export const STATE_BOUNDS = {
  NSW: { minLat: -37.5, maxLat: -28.2, minLng: 141.0, maxLng: 153.6 },
  VIC: { minLat: -39.2, maxLat: -34.0, minLng: 140.9, maxLng: 150.0 },
  QLD: { minLat: -29.2, maxLat: -10.7, minLng: 138.0, maxLng: 153.5 },
  SA:  { minLat: -38.1, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
  WA:  { minLat: -35.2, maxLat: -13.7, minLng: 112.9, maxLng: 129.0 },
  TAS: { minLat: -43.7, maxLat: -39.6, minLng: 143.8, maxLng: 148.4 },
  ACT: { minLat: -35.9, maxLat: -35.1, minLng: 148.7, maxLng: 149.4 },
  NT:  { minLat: -26.0, maxLat: -10.9, minLng: 129.0, maxLng: 138.0 },
}
// Wider than the prospector's intake box (which stops at 112–154°E): a live
// sweep must NOT flag legitimate offshore Australian territories as "outside
// Australia" — Christmas I. (105.6°E), Cocos (96.8°E), Lord Howe (159.1°E),
// Norfolk I. (167.9°E), Macquarie I. (-54.5°S), Torres Strait islands (-9.2°S).
// Genuine overseas mis-pins and (0,0) still fall outside this box because their
// latitudes/longitudes sit well beyond it.
const AUSTRALIA_BOUNDS = { minLat: -55.0, maxLat: -9.0, minLng: 96.0, maxLng: 169.0 }

// Border tolerance for the wrong-state test. Genuine cross-state errors are
// tens–thousands of km off; true border towns (Tweed Heads, Coolangatta) sit
// right on a box edge. ~0.15° ≈ 16 km spares them without rescuing real errors.
const BORDER_BUFFER = 0.15

const STATE_NAME_MAP = {
  'NEW SOUTH WALES': 'NSW', 'VICTORIA': 'VIC', 'QUEENSLAND': 'QLD',
  'SOUTH AUSTRALIA': 'SA', 'WESTERN AUSTRALIA': 'WA', 'TASMANIA': 'TAS',
  'AUSTRALIAN CAPITAL TERRITORY': 'ACT', 'NORTHERN TERRITORY': 'NT',
}

export function normaliseState(s) {
  if (!s) return null
  const t = String(s).trim().toUpperCase()
  if (STATE_BOUNDS[t]) return t
  return STATE_NAME_MAP[t] || null
}

// Which single state's box a coordinate falls squarely inside (null if none —
// offshore territory or a border-box gap). Exported so the gate-check repair can
// derive the CORRECT state from a trusted pin using the exact same box logic that
// flags a wrong_state failure, keeping "flag" and "fix" perfectly consistent.
export function stateFromCoords(lat, lng) {
  for (const [state, b] of Object.entries(STATE_BOUNDS)) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return state
  }
  return null
}

// ═══ GATE 2 — Location ═══════════════════════════════════════════════════════
/**
 * @param {object} listing - { lat, lng, state }
 * @returns failure descriptor | null
 */
export function checkGate2Location(listing) {
  // No coordinates → cannot verify. Not a failure (many listings are
  // locality-only by design); skip Gate 2. Guard the RAW values first —
  // Number(null) coerces to 0, which would otherwise masquerade as (0,0).
  const rawLat = listing.lat, rawLng = listing.lng
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return null
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // Null-island / obviously-broken coordinates (a real numeric 0,0).
  if (lat === 0 && lng === 0) {
    return { gate: 'gate2_location', code: 'null_coords', severity: 3,
      reason: 'Coordinates are (0, 0) — a broken pin in the ocean off Africa. Location data is missing.' }
  }

  // Outside Australia entirely.
  const au = AUSTRALIA_BOUNDS
  if (lat < au.minLat || lat > au.maxLat || lng < au.minLng || lng > au.maxLng) {
    return { gate: 'gate2_location', code: 'outside_australia', severity: 3,
      reason: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) fall outside Australia.` }
  }

  // Wrong state — the pin sits squarely inside a DIFFERENT state's box than
  // claimed. Coords that fall in no state's box (offshore territory like Lord
  // Howe / Norfolk / Christmas I., or a border-box gap) are NOT flagged: only a
  // pin that lands clearly inside another mainland state is a confident error.
  const expected = normaliseState(listing.state)
  if (expected && STATE_BOUNDS[expected]) {
    const b = STATE_BOUNDS[expected]
    const outside =
      lat < b.minLat - BORDER_BUFFER || lat > b.maxLat + BORDER_BUFFER ||
      lng < b.minLng - BORDER_BUFFER || lng > b.maxLng + BORDER_BUFFER
    if (outside) {
      const actual = stateFromCoords(lat, lng)
      if (actual && actual !== expected) {
        return { gate: 'gate2_location', code: 'wrong_state', severity: 2,
          reason: `Listed in ${expected} but the pin is in ${actual} (${lat.toFixed(3)}, ${lng.toFixed(3)}).` }
      }
    }
  }
  return null
}

// ═══ GATE 1 — Web Presence ═══════════════════════════════════════════════════

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-', hellip: '…',
  agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', aelig: 'ae',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', ntilde: 'ñ', ccedil: 'ç', szlig: 'ss',
}
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return ' ' } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)) } catch { return ' ' } })
    .replace(/&([a-z]+);/gi, (_, n) => { const v = NAMED_ENTITIES[n.toLowerCase()]; return v != null ? v : ' ' })
}
// Strips markup to plain text. Deliberately does NOT strip <nav>/<footer> — a
// business's opening hours, phone/email, socials and its own name almost always
// live in the footer; removing it starved Gate 3 (false 'dormant') and the
// name/thin checks. Entities are DECODED (not blanked) so accented names survive.
function htmlToText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim()
}

// ── Name-match helpers ───────────────────────────────────────
const NAME_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'of', 'at', 'on', 'in', 'to', 'co', 'pty', 'ltd', 'inc', 'australia', 'australian'])
function foldAscii(s) { return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase() }

// Venue-type words shared by thousands of businesses — weak evidence that two
// names refer to the SAME business, so nameSimilarity discounts them.
const GENERIC_VENUE_WORDS = new Set([
  'cafe', 'coffee', 'restaurant', 'dining', 'bistro', 'kitchen', 'bakery', 'bar',
  'winery', 'wines', 'wine', 'vineyard', 'brewery', 'brewing', 'distillery', 'cellar', 'door',
  'gallery', 'museum', 'studio', 'studios', 'collective', 'workshop',
  'farm', 'farms', 'orchard', 'grove', 'estate', 'gardens', 'garden', 'park',
  'shop', 'store', 'market', 'trading', 'supply', 'goods',
  'hotel', 'motel', 'lodge', 'retreat', 'stay', 'accommodation', 'cottage', 'cottages', 'house', 'cabins', 'cabin', 'villas', 'villa',
  'tours', 'tour', 'charters', 'charter', 'cruises', 'cruise', 'adventures', 'adventure', 'experiences', 'experience', 'hire',
  'company', 'group', 'club', 'centre', 'center', 'room', 'rooms', 'place', 'beach', 'bay', 'creek', 'river', 'valley', 'mount',
])

// Are two folded tokens the same word, allowing plural/containment/one-typo?
function tokensAlike(a, b) {
  if (a === b) return true
  if (a.replace(/s$/, '') === b.replace(/s$/, '')) return true // singular/plural
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true // ISail↔isailwhitsundays
  if (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && withinOneEdit(a, b)) return true
  return false
}
function withinOneEdit(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  // One pass: find first divergence, then compare the tails under each edit type.
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)            // substitution
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  return long.slice(i + 1) === short.slice(i)                                    // insertion/deletion
}

/**
 * How likely two business names refer to the same business (0–1).
 * Asymmetric on purpose: scores the fraction of the LISTING's name that is
 * present in the candidate's name — a candidate with EXTRA tokens ("Acme
 * Winery — Cellar Door Yarra Valley") still scores high, but a candidate
 * missing the listing's distinctive words scores low. Generic venue words
 * (cafe/tours/estate…) carry ~⅓ the weight of distinctive words. Word-boundary
 * splits are tolerated ("I Sail" ↔ "ISail") via joined-string containment.
 */
export function nameSimilarity(listingName, candidateName) {
  const toks = s => foldAscii(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !NAME_STOPWORDS.has(w))
  const ta = toks(listingName), tb = toks(candidateName)
  if (!ta.length || !tb.length) return 0
  const joinedB = tb.join('')
  let total = 0, matched = 0
  for (const w of ta) {
    const weight = GENERIC_VENUE_WORDS.has(w) ? 0.35 : 1
    total += weight
    if (tb.some(x => tokensAlike(w, x)) || (w.length >= 5 && joinedB.includes(w))) matched += weight
  }
  let score = total ? matched / total : 0
  // Very close whole-string match despite different tokenisation.
  const ja = ta.join('')
  if (score < 0.9 && ja.length >= 6 && (joinedB.includes(ja) || ja.includes(joinedB))) score = 0.9
  return score
}

// Does the page (or its hostname) mention the business name at all? Conservative:
// NFKD-folded on both sides (so 'café' matches 'cafe'), stopwords removed, needs
// ≥2 distinctive words to judge, and a domain-name hit counts as a match (spares
// logo-only headers). Returns a failure descriptor or null.
function nameMismatchFailure(name, lowerText, url) {
  const foldedText = foldAscii(lowerText)
  let host = ''
  try { host = foldAscii(new URL(url).hostname.replace(/^www\./, '')) } catch {}
  const words = foldAscii(name).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !NAME_STOPWORDS.has(w))
  if (words.length < 2) return null // too few distinctive words to judge
  let matched = 0
  for (const w of words) if (foldedText.includes(w) || host.includes(w)) matched++
  const ratio = matched / words.length
  if (ratio < 0.34) {
    return { gate: 'gate1_web', code: 'name_mismatch', severity: 1,
      reason: `Website never mentions "${name}" (${Math.round(ratio * 100)}% name match) — the URL may point at an unrelated site.` }
  }
  return null
}

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

async function fetchOnce(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-verification)' },
      redirect: 'follow',
    })
    return { res }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Live-verify a listing's existing website.
 * @param {object} listing - { name, website }
 * @param {object} opts - { timeoutMs = 9000, retries = 1 }
 * @returns { failure|null, text, lastModified, http_status }
 *
 * Only listings WITH a website are meaningfully checked; a missing website
 * returns { failure: null } (allowed). Bot-blocking statuses (401/403/429) and
 * transient 5xx are deliberately NOT failed — they flood with false positives.
 */
export async function checkGate1Web(listing, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 9000
  const retries = opts.retries ?? 1
  const raw = (listing.website || '').trim()
  if (!raw) return { failure: null, text: null, lastModified: null, http_status: null }

  let url = raw
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  let res, netErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      ({ res } = await fetchOnce(url, timeoutMs))
      netErr = null
      break
    } catch (err) {
      netErr = err
      if (attempt < retries) await new Promise(r => setTimeout(r, 500))
    }
  }

  if (netErr) {
    const cause = netErr.cause?.code || netErr.code || ''
    // DNS/refused = the domain is gone → confident dead signal. Timeout = transient.
    if (netErr.name === 'AbortError' || /timeout|ETIMEDOUT/i.test(cause)) {
      return { failure: { gate: 'gate1_web', code: 'unreachable_timeout', severity: 1,
        reason: 'Website did not respond before timing out (may be temporary).' }, text: null, lastModified: null, http_status: null }
    }
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_NAME|getaddrinfo/i.test(cause + ' ' + netErr.message)) {
      return { failure: { gate: 'gate1_web', code: 'domain_dead', severity: 2,
        reason: 'Website domain does not resolve or refused the connection — the site appears to be gone.' }, text: null, lastModified: null, http_status: null }
    }
    return { failure: { gate: 'gate1_web', code: 'unreachable', severity: 1,
      reason: `Website could not be reached (${netErr.message.slice(0, 80)}).` }, text: null, lastModified: null, http_status: null }
  }

  const http_status = res.status

  if (!res.ok) {
    // 404 / 410 = gone → confident. 401/403/429/5xx = bot-block or transient → skip.
    if (res.status === 404 || res.status === 410) {
      return { failure: { gate: 'gate1_web', code: 'http_gone', severity: 2,
        reason: `Website returns HTTP ${res.status} (page not found) — the listing points at a dead URL.` }, text: null, lastModified: null, http_status }
    }
    return { failure: null, text: null, lastModified: res.headers.get('last-modified') || null, http_status }
  }

  let html = ''
  try { html = await res.text() } catch { html = '' }
  const text = htmlToText(html)
  const lower = text.toLowerCase()
  const lastModified = res.headers.get('last-modified') || null
  // The <title> is the business's own self-identification ("Ballarat Signwriter |
  // Philip Smyth Visual Creations") — kept separate from the body text so the
  // character gate can weigh it as a high-confidence signal.
  const tm = html.match(/<title[^>]*>([\s\S]{0,512}?)<\/title>/i)
  const title = tm ? decodeEntities(tm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null

  for (const p of PARKED_PATTERNS) {
    if (p.test(lower)) {
      return { failure: { gate: 'gate1_web', code: 'parked_domain', severity: 2,
        reason: 'Website is a parked / placeholder / for-sale domain, not a real business site.' }, text, title, lastModified, http_status }
    }
  }

  // JS-rendered SPA: the server response is an app shell we can't assess without
  // executing JS. Extracting little text from one is NOT evidence of a dead site,
  // so skip the content (thin/name) checks entirely rather than false-flag.
  const isSpa = /(?:you need to|please) enable javascript|enable javascript to run this app/i.test(html)
    || /id=["']__next["']|id=["']root["']|id=["']app["']|data-reactroot|ng-app|window\.__NUXT__/i.test(html)

  if (text.length < 200) {
    if (isSpa || html.length > 20000) {
      // A large HTML shell that renders little text is a JS app, not a placeholder.
      return { failure: null, text, title, lastModified, http_status }
    }
    return { failure: { gate: 'gate1_web', code: 'thin_content', severity: 1,
      reason: `Website has almost no content (${text.length} chars) — likely a placeholder or broken page.` }, text, title, lastModified, http_status }
  }
  if (isSpa) return { failure: null, text, title, lastModified, http_status }

  // Unrelated-business (name) check — NFKD-folded, hostname-aware, stopword-filtered.
  // `listing.altNames` (e.g. Google Places' own name for the venue, supplied by
  // the Gate Check repair) rescue a page that identifies itself under a variant
  // spelling of the same business — any one matching name clears the check.
  let nm = nameMismatchFailure(listing.name || '', lower, url)
  if (nm && Array.isArray(listing.altNames)) {
    for (const alt of listing.altNames) {
      if (alt && !nameMismatchFailure(String(alt), lower, url)) { nm = null; break }
    }
  }
  if (nm) return { failure: nm, text, title, lastModified, http_status }

  return { failure: null, text, title, lastModified, http_status }
}

// ═══ GATE 3 — Activity ═══════════════════════════════════════════════════════
/**
 * Runs against website text already fetched by Gate 1 (or cached site_text).
 * Only meaningful when we HAVE text; returns null when we don't.
 * @param {string|null} text
 * @param {string|null} lastModified
 * @param {number} currentYear
 */
export function checkGate3Activity(text, lastModified, currentYear) {
  if (!text || text.length < 200) return null // no reliable text → don't judge
  const t = text.toLowerCase()
  let signals = 0

  if (lastModified) {
    const d = new Date(lastModified)
    if (!isNaN(d)) {
      const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (months <= 12) signals++
    }
  }
  if (/open\s*(?:mon|tue|wed|thu|fri|sat|sun)|opening\s*hours|hours\s*of\s*operation|\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(t)) signals++
  if (/instagram\.com\/|facebook\.com\/|follow\s+us|tiktok\.com\//i.test(t)) signals++
  if (/add\s*to\s*cart|shop\s*now|book\s*(?:now|online|a\s*table|a\s*tour|a\s*room)|buy\s*now|order\s*(?:now|online)|checkout|reservation/i.test(t)) signals++
  const yr = currentYear || new Date().getFullYear()
  if (t.includes(String(yr)) || t.includes(String(yr - 1))) signals++
  if (/(?:\+61|0[2-9])\s*\d[\d\s]{6,}/.test(t) || /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(t)) signals++

  if (signals === 0) {
    return { gate: 'gate3_activity', code: 'dormant', severity: 1,
      reason: 'The website is reachable but shows no sign of an operating business (no hours, contact, socials, commerce, or recent dates).' }
  }
  return null
}

// ═══ GATE 4 — Vertical Fit (deterministic service-trade) ═════════════════════
/**
 * Reuses the gate-review classifier: catches names that are service trades
 * (glazier, plumber, dentist, …) — categorically not visitable destinations.
 * The full LLM fit check is offered on-demand per row in the UI, not in the
 * bulk sweep (budget + noise).
 * @param {object} listing - { name, description, sub_type }
 */
export function checkGate4Vertical(listing) {
  const c = classifyListing(listing)
  if (!c) return null
  // Only surface NAME-level matches in the sweep (high confidence). A
  // description-only mention (low confidence 40) is too noisy for a bulk flag.
  if (c.mechanism === 'keyword_description') return null
  const severity = c.suggested_action === 'delete' ? 3 : 2
  return { gate: 'gate4_vertical', code: c.mechanism === 'junk_type' ? 'junk_type' : 'service_trade',
    severity, reason: c.flag_reason }
}

// ═══ GATE 5 — Character (service business, judged from the site's own content) ═
//
// Closes the gap gate 4 can't see: a B2B service trade whose NAME is innocent
// ("Philip Smyth Visual Creations") but whose own website says loudly what it is
// ("Ballarat Signwriter | …", "vehicle signage", "promote your business"). The
// listing's Atlas description can't be trusted here — for exactly these listings
// it tends to be wrong — so this judges only what the business says about itself.
//
// Two tiers, both precision-first (a false positive hides a real venue):
//   • TITLE hit — a service-trade keyword in the <title> tag (the business's own
//     SEO self-identification) → confident, code 'service_business'.
//   • PHRASE score — ≥3 distinct B2B trade phrases in the page text → verify
//     tier, code 'service_business_verify'.
// Either tier is VETOED when the page shows ≥2 venue-visit signals (a museum
// whose title says "Electrical", a winery quoting for functions).

const B2B_SIGNALS = [
  { re: /\bsign\s?writ(?:er|ers|ing)\b/i,                                                        tag: 'signwriting' },
  { re: /\b(?:vehicle|fleet|shopfront|corporate|commercial|industrial|illuminated|led|3d)\s+sign(?:s|age|writing)\b/i, tag: 'trade signage' },
  { re: /\b(?:free|no[-\s]obligation|obligation[-\s]free)\s+(?:quote|quotes|measure)\b/i,        tag: 'free-quote pitch' },
  { re: /\b(?:promote|advertise|grow)\s+your\s+business\b/i,                                     tag: 'B2B marketing pitch' },
  { re: /\b(?:commercial\s+and\s+residential|residential\s+and\s+commercial)\b/i,                tag: 'commercial & residential' },
  { re: /\bfully\s+licen[cs]ed\s+and\s+insured\b/i,                                              tag: 'licensed & insured' },
  { re: /\btrade\s+suppl(?:y|ies|iers?)\b/i,                                                     tag: 'trade supplies' },
  { re: /\b(?:and|all)\s+surrounding\s+(?:areas|suburbs)\b/i,                                    tag: 'service-area wording' },
  { re: /\bsite\s+(?:measurement|survey)s?\b/i,                                                  tag: 'site survey' },
  { re: /\b(?:our|valued)\s+clients\b/i,                                                         tag: 'client-speak' },
]

// Signals that the site belongs to a place people VISIT. Deliberately excludes
// generic marketing words ("collection", "showroom", singular "workshop") that
// trade sites also use.
const VENUE_SIGNALS = [
  /\b(?:visit us|plan your visit|open to the public|opening hours|admission|tickets?)\b/i,
  /\b(?:museum|gallery|exhibitions?|cellar door|tastings?|workshops|classes|masterclass)\b/i,
  /\b(?:menu|book (?:a )?(?:table|tour|room)|reservations?|accommodation|stay with us)\b/i,
  /\b(?:add to cart|shop (?:online|now)|order online)\b/i,
]

// ── Materials / wholesale MERCHANT — by NAME ─────────────────────────────────
// A business whose own NAME says it is a wholesaler, distributor, timber/building
// merchant or trade-supplies yard. These sell materials to trade & builders — not
// a maker of finished goods and not a place the public visits. Kept tight and
// multi-word so a curated maker's name never trips ("X Furniture", "X Joinery",
// "wine merchant" bottle shops, "coffee merchant" roasters all stay clear —
// bare "merchant" is deliberately NOT here). Runs even with no website.
// Building/trade-materials-specific merchant forms. Safe to match against a
// business's page TITLE as well as its name — a curated food/drink producer or
// maker never titles itself a "timber merchant" / "hardware supplies" / "…& Sales".
const MERCHANT_TRADE_SIGNALS = [
  { re: /\btimber\s+(?:merchants?|supplies|supplier|suppliers|yard|traders?|sales|centre|center)\b/i, label: 'timber merchant / yard' },
  { re: /\b(?:building|hardware|plumbing|electrical|steel|fencing|paving|irrigation|pool|glass|tile|roofing|bathroom|kitchen|industrial|packaging|catering|hospitality|safety)\s+suppl(?:y|ies|ier|iers)\b/i, label: 'trade / building supplier' },
  { re: /\b(?:builders?|timber|hardware|produce|steel|iron|rural)\s+merchants?\b/i,               label: 'trade merchant' },
  // "…& Sales" is a dealer/retail-supply suffix a curated maker never uses.
  { re: /\b(?:kitchens?|cabinets?|cabinetry|joinery|timber|furniture|bathrooms?|tiles?)\s*(?:&|and|\+)\s*sales\b/i, label: 'retail / sales dealer' },
  // Timber + product yard ("…Timbers & Cabinets/Hardware") — sells timber & fittings.
  { re: /\btimbers?\s*(?:&|and|\+)\s*(?:cabinets?|hardware|building)\b/i,                          label: 'timber & building-product supplier' },
  // Scientific glassware is B2B lab equipment, never a visitable glass studio.
  { re: /\b(?:lab|laboratory|scientific)\s*glass(?:ware)?\b/i,                                     label: 'scientific-glassware supplier' },
]

// Generic wholesale/distribution words. Definitional in a business NAME
// ("Queensland Wholesale Canvas") but merely a sales-channel mention in a page
// TITLE — a specialty coffee ROASTER or artisan BAKERY that also wholesales
// ("… | Wholesale & Retail") is a curated maker, not a wholesaler. So these are
// matched against the NAME only, never the title.
const MERCHANT_NAME_ONLY_SIGNALS = [
  { re: /\bwholesal(?:e|er|ers)\b/i,           label: 'wholesaler' },
  { re: /\b(?:distributors?|distribution)\b/i, label: 'distributor' },
]

// Name-tier looks at all of them; title-tier only the trade-specific ones.
const MERCHANT_NAME_SIGNALS = [...MERCHANT_NAME_ONLY_SIGNALS, ...MERCHANT_TRADE_SIGNALS]
const MERCHANT_TITLE_SIGNALS = MERCHANT_TRADE_SIGNALS

// ── Building-materials PRODUCT lines ─────────────────────────────────────────
// A materials/timber SUPPLIER sells these by the metre; a maker of finished
// furniture does not carry them as a product range. Timber-specific wherever a
// bare word would be ambiguous ("timber screening"/"timber flooring", not bare
// "screening"/"flooring" a maker might mention once).
const MATERIALS_PRODUCT = [
  { re: /\bdecking\b/i,                              tag: 'decking' },
  { re: /\bcladding\b/i,                             tag: 'cladding' },
  { re: /\btimber\s+screening\b/i,                   tag: 'screening' },
  { re: /\blining\s+boards?\b/i,                     tag: 'lining boards' },
  { re: /\bstructural\s+(?:timber|pine|hardwood)\b/i, tag: 'structural timber' },
  { re: /\bdressed\s+(?:timber|hardwood|pine)\b/i,   tag: 'dressed timber' },
  { re: /\b(?:railway\s+)?sleepers?\b/i,             tag: 'sleepers' },
  { re: /\bweatherboards?\b/i,                       tag: 'weatherboards' },
  { re: /\bframing\s+timber\b/i,                     tag: 'framing timber' },
  { re: /\bfloorboards?\b/i,                         tag: 'floorboards' },
  { re: /\btimber\s+flooring\b/i,                    tag: 'timber flooring' },
  { re: /\bmerbau\b/i,                               tag: 'merbau' },
  { re: /\btreated\s+pine\b/i,                       tag: 'treated pine' },
  { re: /\btimber\s+mouldings?\b/i,                  tag: 'mouldings' },
  { re: /\barchitraves?\b/i,                         tag: 'architraves' },
  { re: /\bskirting\s+boards?\b/i,                   tag: 'skirting' },
  { re: /\bpost\s*(?:&|and)\s*rail\b/i,              tag: 'post & rail' },
  { re: /\bfence\s+palings?\b/i,                     tag: 'fence palings' },
  { re: /\bpaling\s+fenc/i,                          tag: 'paling fencing' },
  { re: /\bbearers?\s+(?:&|and)\s+joists?\b/i,       tag: 'bearers & joists' },
]

// Explicit SUPPLY / wholesale language — the decisive tell. A maker says "we make
// / craft / design"; a supplier says "we supply / stock", "supplier of", "trade
// prices", "wholesale". Because this is decisive, one such phrase + ≥2 materials
// product lines flags even on a page carrying stray venue words.
const SUPPLY_LANG = [
  { re: /\b(?:leading\s+)?supplier\s+of\b/i,                                    tag: '“supplier of”' },
  { re: /\bwe\s+(?:supply|stock)\b/i,                                           tag: '“we supply/stock”' },
  { re: /\btrade\s+(?:price|prices|account|accounts|counter|discount|discounts)\b/i, tag: 'trade prices' },
  { re: /\bwholesale\b/i,                                                       tag: 'wholesale' },
  { re: /\bbulk\s+(?:order|orders|supply|discount|discounts|quantit)/i,         tag: 'bulk supply' },
  { re: /\b(?:linear|lineal)\s+met(?:re|er)/i,                                  tag: 'sold per metre' },
]

// ── Commercial FABRICATION / production-service signals ──────────────────────
// A scenic/prop/set fabricator, exhibition or shop fit-out contractor, or a
// CNC/laser/3D-print SERVICE bureau builds to a client's spec for other
// businesses & productions — it is NOT a maker of finished goods sold to the
// public, nor a place the public visits. Its NAME is often innocent ("Form
// Imagination") and its Atlas description often wrong, so — like the materials
// tier — this judges the site's OWN content.
//
// FAB_STRONG terms are near-unique to this trade: a curated furniture maker,
// jeweller, ceramicist or glass artist does not describe its work as "scenic
// construction", "prop making", "shopfitting", "steel fabrication" or "stage
// decks". FAB_SERVICE terms (laser cutting, CNC, 3D printing, prototyping,
// fit-out) are ALSO used by some genuine makers, so they only ever corroborate —
// never flag on their own beyond the low-confidence verify tier.
const FAB_STRONG = [
  { re: /\bscenic\s+(?:finish|construc|fabricat|paint|art|artist|design|carpentr|department|backdrop|element|studio|servic)/i, tag: 'scenic construction' },
  { re: /\bset\s+(?:construction|building|builders?)\b|\bset[-\s]?build(?:ing|ers?)?\b/i,          tag: 'set construction' },
  { re: /\bprop[-\s]?(?:making|maker|makers)\b|\bpropmaking\b/i,                                   tag: 'prop making' },
  // Target exhibition-STAND fabricators (trade-show build) — NOT artists/galleries
  // who merely exhibit. Bare "exhibition builds/stands" matched innocent art copy
  // ("the exhibition builds on…", "the exhibition stands until…"), so require an
  // explicit stand-build / fabrication noun.
  { re: /\bexhibition\s+(?:stand\s+(?:build|builder|fabricat)|fabricat|joinery)|\bstand\s+builders?\b|\bexhibition\s+(?:&|and)\s+display\b/i, tag: 'exhibition stand builder' },
  { re: /\bshop\s?fitt?(?:ing|er|ers|out|outs)\b/i,                                                tag: 'shopfitting' },
  { re: /\b(?:steel|metal|sheet[-\s]?metal|structural|alumini?um)\s+fabricat(?:ion|or|ors)\b/i,    tag: 'metal fabrication' },
  { re: /\bstage\s+decks?\b|\brostra\b/i,                                                          tag: 'staging' },
  { re: /\bthemed?\s+(?:environments?|spaces?)\b|\btheming\b/i,                                    tag: 'themed environments' },
]
// SERVICE terms only CORROBORATE — they never flag on their own. Deliberately NO
// bare "fabrication": it double-counted inside the STRONG "metal fabrication"
// phrase (one mention = a fake 2 signals), which flagged a knifemaker and a
// scenic-cruise operator that merely said "metal fabrication" once. "turnkey" is
// generic hospitality/interiors business-speak, so it corroborates but is not a
// STRONG tell on its own (it had flagged a wine bar).
const FAB_SERVICE = [
  { re: /\bturnkey\b/i,                                tag: 'turnkey' },
  { re: /\blaser\s+cut(?:ting)?\b/i,                   tag: 'laser cutting' },
  { re: /\bcnc\b/i,                                    tag: 'CNC' },
  { re: /\b3d\s+print(?:ing|ed|er|ers)?\b/i,           tag: '3D printing' },
  { re: /\bwater\s?jet\b/i,                            tag: 'waterjet' },
  { re: /\btube\s+(?:cutting|bending)\b/i,             tag: 'tube cutting' },
  { re: /\bpowder[-\s]?coat(?:ing|ed)?\b/i,            tag: 'powder coating' },
  { re: /\bprototyp(?:e|es|ing)\b/i,                   tag: 'prototyping' },
  { re: /\bfit[-\s]?outs?\b/i,                         tag: 'fit-out' },
  { re: /\bdesign\s+(?:and|&|\+)\s+(?:construct|fabricat|build)\b/i, tag: 'design & construct' },
]

// STRICTER visit veto used ONLY by the fabrication tier. A fabricator's own
// portfolio names its museum/gallery/exhibition clients and its "shop" arm,
// which trip the generic VENUE_SIGNALS (bare "museum", "shop now") without the
// public actually visiting or buying finished goods here. So the fabrication
// tier asks a harder question: does the site show a place the public genuinely
// visits and transacts at — real opening hours, a cellar door / tasting, a food
// menu, ticketed admission, a bookable table/tour/room, an add-to-cart shop?
const GENUINE_VISIT_SIGNALS = [
  /\bopening\s+hours\b|\bhours\s+of\s+operation\b|\bopen\s+(?:7\s+days|daily|tue|wed|thu|fri|sat|sun|mon)/i,
  /\b(?:plan\s+your\s+visit|open\s+to\s+the\s+public)\b/i,
  /\b(?:admission|entry\s+fee|general\s+admission|book\s+(?:your\s+)?(?:tickets?|a\s+table|a\s+tour|a\s+room)|reservations?)\b/i,
  /\bcellar\s+door\b|\b(?:wine|gin|whisky|beer)\s+tastings?\b|\btasting\s+room\b/i,
  /\b(?:our|the|dinner|lunch|breakfast|food|drinks|seasonal|à\s?la\s?carte)\s+menu\b|\bview\s+(?:our\s+)?menu\b/i,
  /\b(?:accommodation|stay\s+with\s+us|our\s+rooms|book\s+your\s+stay)\b/i,
  /\b(?:add\s+to\s+cart|add\s+to\s+basket)\b/i,
]

/**
 * @param {object} listing - { name }
 * @param {object} site - { title, text } from checkGate1Web (live fetch only)
 * @returns failure descriptor | null
 */
export function checkGate5ServiceBusiness(listing, site = {}) {
  const name = (listing && listing.name != null) ? String(listing.name) : ''

  // Tier 0 — the NAME self-identifies as a wholesale / materials merchant.
  // Runs first, needs no website: a "Timber Supplies" or "…Wholesale…" is a
  // trade supplier however thin its web presence.
  for (const m of MERCHANT_NAME_SIGNALS) {
    if (m.re.test(name)) {
      return { gate: 'gate5_character', code: 'materials_supplier', severity: 2,
        reason: `The name identifies a ${m.label} — a wholesale/trade supplier of materials, not a maker of finished goods or a place the public visits.` }
    }
  }

  const title = (site.title || '').trim()
  const text = site.text || ''
  if (!title && text.length < 200) return null // nothing reliable to judge

  const combined = (title + ' ' + text).toLowerCase()

  // Tier 0b — the site's own TITLE self-identifies as a trade merchant/supplier
  // ("Designwood | Timber Merchants | …"), even when the listing name is neutral.
  // Uses only the trade-specific forms — NOT the generic wholesale/distributor
  // words, which legit roasters/bakeries put in titles ("… | Wholesale & Retail").
  if (title) {
    for (const m of MERCHANT_TITLE_SIGNALS) {
      if (m.re.test(title)) {
        return { gate: 'gate5_character', code: 'materials_supplier', severity: 2,
          reason: `The business's own website titles itself "${title.slice(0, 90)}" — a ${m.label}, not a maker of finished goods or a visitable venue.` }
      }
    }
  }

  // Tier A — building-materials SUPPLIER by its own content. Explicit supply
  // language ("supplier of", "we stock", "trade prices") + ≥2 building-materials
  // product lines (decking, cladding, lining boards, structural timber…) that a
  // maker of finished pieces doesn't carry. Supply language is decisive, so this
  // runs BEFORE the venue veto — a timber yard's own page routinely carries stray
  // venue words ("opening hours", a photo "gallery", a nav "menu").
  const mats = MATERIALS_PRODUCT.filter(s => s.re.test(combined))
  const supply = SUPPLY_LANG.filter(s => s.re.test(combined))
  if (supply.length >= 1 && mats.length >= 2) {
    const ev = [supply[0].tag, ...mats.slice(0, 3).map(m => m.tag)]
    return { gate: 'gate5_character', code: 'materials_supplier', severity: 2,
      reason: `The website reads as a timber / building-materials supplier (${ev.join(', ')}) — it sells materials to trade & builders, not a maker of finished goods or a visitable venue.` }
  }

  // Tier F — commercial FABRICATION / production service (scenic & prop, set,
  // exhibition/shop fit-out, industrial fabrication, or a CNC/laser/3D-print
  // bureau). Judged from the site's own content and gated by the STRICTER visit
  // veto, because this class routinely names museum/gallery clients and runs a
  // "shop" arm that would spuriously trip the generic venue words.
  //
  // ALWAYS requires ≥2 corroborating signals — a SINGLE ambiguous term never
  // flags. A brewery saying "themed environments", a shoemaker "shopfitting", a
  // knifemaker "metal fabrication", a wine bar "turnkey" each trip exactly one
  // signal and must stay clear; a real fabricator trips several. Runs BEFORE the
  // generic venue veto so a fabricator's client/shop chrome can't suppress it.
  //   • confident (hide): ≥2 STRONG, or 1 STRONG + ≥2 SERVICE.
  //   • verify (keep):    1 STRONG + 1 SERVICE, or ≥3 SERVICE.
  const fabStrong = FAB_STRONG.filter(s => s.re.test(combined))
  const fabService = FAB_SERVICE.filter(s => s.re.test(combined))
  const confident = fabStrong.length >= 2 || (fabStrong.length >= 1 && fabService.length >= 2)
  const verify = !confident && ((fabStrong.length >= 1 && fabService.length >= 1) || fabService.length >= 3)
  if (confident || verify) {
    let visit = 0
    for (const re of GENUINE_VISIT_SIGNALS) if (re.test(combined)) visit++
    if (visit < 2) {
      const ev = [...fabStrong.map(s => s.tag), ...fabService.map(s => s.tag)].slice(0, 4)
      if (confident) {
        return { gate: 'gate5_character', code: 'fabrication_service', severity: 2,
          reason: `The website reads as a commercial fabrication / production service (${ev.join(', ')}) — it builds to client spec for other businesses & productions, not a maker of finished goods or a place the public visits.` }
      }
      return { gate: 'gate5_character', code: 'fabrication_service_verify', severity: 1,
        reason: `The website shows commercial fabrication / production-service signals (${ev.join(', ')}) — may build to spec for trade & productions rather than being a visitable maker.` }
    }
  }

  let venueSignals = 0
  for (const re of VENUE_SIGNALS) if (re.test(combined)) venueSignals++
  if (venueSignals >= 2) return null // reads like a visitable venue — don't judge

  // Tier A-weak — heavy building-materials vocabulary but no explicit supply verb.
  // Only when the page doesn't read like a venue (venue veto above already
  // applied). Verify tier — a maker who also lists a flooring/decking service
  // is spared unless the yard vocabulary dominates.
  if (mats.length >= 3) {
    return { gate: 'gate5_character', code: 'materials_supplier_verify', severity: 1,
      reason: `The website lists building-materials product lines (${mats.slice(0, 4).map(m => m.tag).join(', ')}) — reads as a supplier rather than a maker or visitable venue.` }
  }

  // Tier 1 — trade keyword in the site's own title (confident).
  if (title) {
    for (const d of SERVICE_TRADE_DISQUALIFIERS) {
      const m = title.match(d.re)
      if (m) {
        return { gate: 'gate5_character', code: 'service_business', severity: 2,
          reason: `The business's own website titles itself "${title.slice(0, 90)}" — a ${d.label} service business, not a visitable venue.` }
      }
    }
  }

  // Tier 2 — B2B trade phrasing throughout the page (verify).
  const tags = []
  for (const s of B2B_SIGNALS) if (s.re.test(combined)) tags.push(s.tag)
  if (tags.length >= 3) {
    return { gate: 'gate5_character', code: 'service_business_verify', severity: 1,
      reason: `The website reads as a commercial service business (${tags.slice(0, 4).join(', ')}), not a visitable venue.` }
  }
  return null
}

// ═══ Aggregation ═════════════════════════════════════════════════════════════

const SEVERITY_LABEL = { 3: 'high', 2: 'medium', 1: 'low' }

// Which action a given failure code recommends. Strongest across all failures
// wins (delete > hide > pass).
const CODE_ACTION = {
  null_coords: 'hide',
  outside_australia: 'hide',
  wrong_state: 'hide',
  parked_domain: 'hide',
  http_gone: 'hide',
  domain_dead: 'hide',
  service_trade: 'delete',      // overridden to 'hide' below when the disqualifier is 'review'-tier
  junk_type: 'hide',
  commercial_group: 'hide',     // corporate-owned / not independent — confident
  service_business: 'hide',     // site titles itself a service trade — confident
  materials_supplier: 'hide',   // wholesale/trade materials supplier — confident
  fabrication_service: 'hide',  // scenic/prop/fit-out fabricator or CNC bureau — confident
  wrong_vertical_ai: 'hide',    // on-demand AI: clearly wrong vertical
  // low-confidence → recommend keeping (admin still reviews):
  thin_content: 'pass',
  name_mismatch: 'pass',
  unreachable: 'pass',
  unreachable_timeout: 'pass',
  dormant: 'pass',
  commercial_group_verify: 'pass', // corporate-owned but heritage/edge — verify
  service_business_verify: 'pass', // B2B phrasing only — verify
  materials_supplier_verify: 'pass', // building-materials vocab, no supply verb — verify
  fabrication_service_verify: 'pass', // fabrication/service-bureau vocab, not confident — verify
  low_fit_ai: 'pass',
}
const ACTION_RANK = { pass: 0, hide: 1, delete: 2 }

/**
 * Combine a listing's gate failures into a single queue row payload.
 * @param {Array} failures - non-null descriptors from the checks above
 * @param {object} extra - { website, http_status }
 * @returns row payload | null (null = no failures)
 */
export function summariseFailures(failures, extra = {}) {
  const list = (failures || []).filter(Boolean)
  if (!list.length) return null

  let action = 'pass'
  for (const f of list) {
    // service_trade only recommends delete for the unambiguous ('delete'-tier)
    // disqualifiers, which we encode as severity 3.
    let a = CODE_ACTION[f.code] || 'pass'
    if (f.code === 'service_trade' && f.severity < 3) a = 'hide'
    if (ACTION_RANK[a] > ACTION_RANK[action]) action = a
  }

  const maxSev = Math.max(...list.map(f => f.severity))
  // Sort details strongest-first for display.
  const details = list.slice().sort((a, b) => b.severity - a.severity)
  const primary = details[0]

  return {
    failed_gates: [...new Set(details.map(f => f.gate))],
    // suggested_vertical must survive the flatten — the queue's "Move to X
    // Atlas" remediation reads it; dropping it here killed that button on
    // every re-scan of a row carrying an AI wrong-vertical finding.
    gate_details: details.map(f => ({ gate: f.gate, code: f.code, severity: f.severity, reason: f.reason, ...(f.suggested_vertical ? { suggested_vertical: f.suggested_vertical } : {}) })),
    primary_gate: primary.gate,
    reason_summary: details.map(f => f.reason).join(' '),
    severity: SEVERITY_LABEL[maxSev] || 'low',
    suggested_action: action,
    website: extra.website || null,
    http_status: extra.http_status ?? null,
  }
}

// Human labels for the four gates (shared by the UI).
export const GATE_LABELS = {
  gate1_web: 'Web Presence',
  gate2_location: 'Location',
  gate3_activity: 'Activity',
  gate4_vertical: 'Vertical Fit',
  gate5_character: 'Character',
}
