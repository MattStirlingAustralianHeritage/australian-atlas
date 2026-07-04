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

import { classifyListing } from '../gate/classify.js'

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

function stateFromCoords(lat, lng) {
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

  for (const p of PARKED_PATTERNS) {
    if (p.test(lower)) {
      return { failure: { gate: 'gate1_web', code: 'parked_domain', severity: 2,
        reason: 'Website is a parked / placeholder / for-sale domain, not a real business site.' }, text, lastModified, http_status }
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
      return { failure: null, text, lastModified, http_status }
    }
    return { failure: { gate: 'gate1_web', code: 'thin_content', severity: 1,
      reason: `Website has almost no content (${text.length} chars) — likely a placeholder or broken page.` }, text, lastModified, http_status }
  }
  if (isSpa) return { failure: null, text, lastModified, http_status }

  // Unrelated-business (name) check — NFKD-folded, hostname-aware, stopword-filtered.
  const nm = nameMismatchFailure(listing.name || '', lower, url)
  if (nm) return { failure: nm, text, lastModified, http_status }

  return { failure: null, text, lastModified, http_status }
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
  wrong_vertical_ai: 'hide',    // on-demand AI: clearly wrong vertical
  // low-confidence → recommend keeping (admin still reviews):
  thin_content: 'pass',
  name_mismatch: 'pass',
  unreachable: 'pass',
  unreachable_timeout: 'pass',
  dormant: 'pass',
  commercial_group_verify: 'pass', // corporate-owned but heritage/edge — verify
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
    gate_details: details.map(f => ({ gate: f.gate, code: f.code, severity: f.severity, reason: f.reason })),
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
