// ============================================================
// Outreach email discovery
// ------------------------------------------------------------
// Listings carry a website + phone but no email. To run outreach we discover a
// contact email from the operator's own website: the homepage and, if needed,
// the contact/about pages it links to. We read mailto: links, plain-text
// addresses, JSON-LD `email`, and decode Cloudflare-obfuscated emails, then
// filter platform junk and score for the best same-domain, role-based address
// (info@, hello@, bookings@ …).
//
// It never fabricates an address — it only extracts what the operator has
// conspicuously published, which is the basis for lawful B2B contact under the
// Spam Act 2003 (Cth). Everything is best-effort and fails soft.
//
// Robustness the hit-rate depends on (measured — roughly triples finds):
//   • domain variants: many stored URLs are apex-only or www-only, or serve on
//     http not https — try www↔apex and https↔http before giving up.
//   • contact-page discovery: follow the site's OWN contact/about nav links
//     (not just guessed paths) — that is where most operators put the address.
//   • dead-domain detection: an NXDOMAIN / never-resolving host is reported as
//     `dead` (a stale website in our data), distinct from a live site that
//     simply publishes no email (`no_email`) or blocks the crawl (`blocked`).
// ============================================================

const FETCH_TIMEOUT_MS = 7000
const MAX_HTML_BYTES = 1_500_000 // don't parse multi-MB pages

// A plain, current browser UA. Bespoke bot UAs get bounced by naive WAF rules,
// which cost us legitimately-published public contact addresses; this is a
// bounded, low-volume, respectful crawl of a business's own contact page.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Contact-ish paths tried (in addition to the homepage's own links) when the
// homepage yields nothing. Ordered by likelihood; Shopify uses /pages/contact.
const CONTACT_PATHS = [
  '/contact', '/contact-us', '/contact-us/', '/contactus', '/contact/',
  '/about', '/about-us', '/get-in-touch', '/enquiries', '/enquiry',
  '/connect', '/reach-us', '/pages/contact', '/pages/contact-us', '/contact.html',
]

// Local-parts that read like a real inbox a human checks — ranked highest.
const ROLE_LOCALPARTS = [
  'hello', 'hi', 'info', 'contact', 'enquiries', 'enquiry', 'inquiries',
  'bookings', 'booking', 'reservations', 'reception', 'office', 'admin',
  'orders', 'shop', 'sales', 'cellardoor', 'cellar', 'team', 'studio',
  'mail', 'email', 'hey', 'stay', 'eat', 'dine', 'events', 'gallery', 'art',
]

// Substrings that mark an address as platform noise / not an operator inbox,
// including the common template placeholders that a naive scrape picks up
// (user@, your@, name@, example@ …).
const JUNK_SUBSTRINGS = [
  'sentry', 'wixpress', 'wix.com', 'squarespace', 'godaddy', 'wordpress',
  'shopify', 'cloudflare', 'example.', 'yourdomain', 'domain.com', 'email.com',
  'sentry.io', 'localhost', 'test.com', 'name@', 'user@', 'your@', 'youremail',
  'yourname', 'yourbusiness', 'email@address', 'email@example', 'sample@',
  'firstname', 'lastname', 'someone@', 'abc@', 'xyz@', 'company.com',
  'website.com', 'site.com', 'mysite', 'mydomain', 'placeholder',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'abuse@', 'privacy@', 'unsubscribe@', 'bounce',
  'react', 'protolabs', 'w3.org', 'schema.org', 'googlemail-noreply',
  'gravatar', 'jsdelivr', 'gstatic', 'googleapis', 'cdn.', 'core-js',
]

// Extensions that mean we matched an asset filename, not an email.
const ASSET_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.ico', '.woff', '.woff2', '.mp4', '.pdf']

// Linear, length-bounded email matcher. A previous pattern nested unbounded
// quantifiers in the domain and catastrophically backtracked on adversarial page
// content — pure sync CPU that blocked the event loop and ran the whole batch
// into a serverless timeout (one site pinned a worker for 243s). This form has a
// single bounded char class for the domain body (no nesting) plus explicit
// length caps (local ≤64, domain body ≤253, TLD ≤24), so matching is linear.
const EMAIL_RE = /[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[a-z0-9][a-z0-9.-]{0,253}\.[a-z]{2,24}/gi

// ── Fetch ─────────────────────────────────────────────────────

function withTimeout(ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, done: () => clearTimeout(t) }
}

/**
 * Fetch a URL and classify the outcome so the caller can tell a dead host from a
 * blocked one from an empty one.
 * @returns {Promise<{ ok: boolean, status: number, html: string, resolved: boolean, finalUrl: string }>}
 *   status 0 = network/DNS failure (host didn't resolve or connect); resolved is
 *   false only in that case.
 */
async function fetchRaw(url) {
  const { signal, done } = withTimeout(FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    })
    const ctype = res.headers.get('content-type') || ''
    if (!res.ok || (ctype && !ctype.includes('html') && !ctype.includes('text') && !ctype.includes('xml'))) {
      return { ok: false, status: res.status, html: '', resolved: true, finalUrl: res.url }
    }
    const buf = await res.arrayBuffer()
    const html = Buffer.from(buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf).toString('utf8')
    return { ok: true, status: res.status, html, resolved: true, finalUrl: res.url }
  } catch {
    // AbortError (timeout) or a network/DNS error. We can't cleanly separate a
    // slow-but-live host from a dead one here, so treat a bare timeout as
    // "resolved: false" too — the caller only escalates to `dead` when EVERY
    // variant fails this way, which for a live host is vanishingly unlikely.
    return { ok: false, status: 0, html: '', resolved: false, finalUrl: url }
  } finally {
    done()
  }
}

// ── Extraction ────────────────────────────────────────────────

// Cloudflare "email obfuscation" replaces addresses with
// <a class="__cf_email__" data-cfemail="HEX">[email&nbsp;protected]</a>.
// The hex is the address XOR-encoded with its own first byte as the key.
function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16)
    let out = ''
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
    }
    return out
  } catch {
    return null
  }
}

function htmlDecode(s) {
  return s
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.')
    .replace(/&amp;/gi, '&')
    // Bracketed obfuscation only — "info [at] x [dot] com". Textual " at "/" dot "
    // are deliberately NOT decoded (too many false positives in prose).
    .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, '@')
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, '.')
}

function registrableHost(host) {
  if (!host) return ''
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  if (parts.length <= 2) return parts.join('.')
  // Handle common AU/second-level TLDs: com.au, net.au, org.au, asn.au, co.uk …
  const twoLevel = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'id', 'asn'])
  const last = parts[parts.length - 1]
  const secondLast = parts[parts.length - 2]
  if (twoLevel.has(secondLast) && last.length <= 3) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function extractEmailsFromHtml(html) {
  const found = new Set()
  let m

  // 1. Cloudflare-obfuscated addresses.
  const cfRe = /data-cfemail="([0-9a-fA-F]+)"/g
  while ((m = cfRe.exec(html)) !== null) {
    const dec = decodeCfEmail(m[1])
    if (dec) found.add(dec)
  }

  // 2. mailto: links (highest confidence — the operator meant these).
  const mailtoRe = /mailto:([^"'?>\s]+)/gi
  while ((m = mailtoRe.exec(html)) !== null) {
    try { found.add(decodeURIComponent(m[1])) } catch { found.add(m[1]) }
  }

  // 3. JSON-LD / inline-JSON `"email": "..."` (schema.org Organization,
  //    ContactPoint, LocalBusiness). Strip a leading mailto: if present.
  const jsonRe = /"email"\s*:\s*"(?:mailto:)?([^"\\]+@[^"\\]+?)"/gi
  while ((m = jsonRe.exec(html)) !== null) {
    found.add(m[1])
  }

  // 4. Plain-text addresses (incl. lightly obfuscated) anywhere in the markup.
  const decoded = htmlDecode(html)
  const textRe = new RegExp(EMAIL_RE.source, 'gi')
  while ((m = textRe.exec(decoded)) !== null) {
    found.add(m[0])
  }

  return [...found]
}

/**
 * Same-origin contact/about links from the homepage — this is where operators
 * actually publish the address, and paths vary wildly (/get-in-touch, /connect,
 * /contact-us/, …), so we follow the site's OWN links rather than only guessing.
 */
function contactLinks(html, origin) {
  const links = new Set()
  const re = /href\s*=\s*["']([^"'#]+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1]
    if (!/contact|about|enquir|connect|reach|get-in-touch|hello|team|imprint|impressum/i.test(href)) continue
    try {
      const u = new URL(href, origin)
      if (u.origin !== origin) continue
      if (u.pathname.length > 60) continue
      links.add(u.origin + u.pathname)
    } catch { /* skip unparseable href */ }
  }
  return [...links].slice(0, 6)
}

function isPlausibleEmail(email) {
  if (!email) return false
  const e = email.toLowerCase().trim()
  // Require a real ≥2-char TLD — rejects truncated captures like "s@gmail.c".
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(e)) return false
  if (e.length > 100) return false
  if (ASSET_SUFFIXES.some((s) => e.endsWith(s))) return false
  if (JUNK_SUBSTRINGS.some((s) => e.includes(s))) return false
  const [local, host] = e.split('@')
  if (!local || !host) return false
  if (/@\d+\.\d+/.test(e)) return false // e.g. jquery@3.6
  if (/^\d+$/.test(local)) return false // purely numeric local part
  return true
}

// Score candidates so the best operator inbox wins.
function scoreEmail(email, siteHost) {
  const e = email.toLowerCase()
  const [local, host] = e.split('@')
  let score = 0

  const siteReg = registrableHost(siteHost)
  const emailReg = registrableHost(host)
  if (siteReg && emailReg === siteReg) score += 50 // same domain as their site
  else if (host.endsWith('.au')) score += 8 // at least an AU business address

  if (ROLE_LOCALPARTS.includes(local)) score += 25
  else if (/^[a-z]+\.[a-z]+$/.test(local)) score += 6 // firstname.lastname — a real person

  // Free-mail is fine for small operators, but slightly less ideal than a
  // branded domain address.
  if (/(gmail|hotmail|outlook|yahoo|bigpond|icloud|me\.com|live\.com)\./.test(host)) score -= 4

  // Prefer shorter, cleaner local parts.
  score -= Math.max(0, local.length - 16) * 0.5

  return score
}

// ── URL variants ──────────────────────────────────────────────

/**
 * Candidate homepage URLs to try in order. A stored website is often apex-only
 * or www-only, or serves on http rather than https — probing the variants turns
 * a lot of "dead" hosts back into live ones. The original (as-stored) form is
 * tried first so a correctly-configured site costs exactly one fetch.
 */
function urlVariants(website) {
  let u
  try {
    u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
  } catch {
    return []
  }
  const host = u.hostname
  const bare = host.replace(/^www\./, '')
  const altHost = host.startsWith('www.') ? bare : `www.${bare}`
  const proto = u.protocol === 'http:' ? 'http:' : 'https:'
  const altProto = proto === 'https:' ? 'http:' : 'https:'
  const path = u.pathname && u.pathname !== '/' ? u.pathname : '/'
  const seen = new Set()
  const out = []
  const add = (p, h) => { const url = `${p}//${h}${path}`; if (!seen.has(url)) { seen.add(url); out.push(url) } }
  add(proto, host)      // exactly as stored
  add(proto, altHost)   // toggle www
  add(altProto, host)   // toggle protocol
  add(altProto, altHost)
  return out
}

/**
 * Discover the best contact email for a website.
 * @param {string} website  Operator website URL (may lack protocol).
 * @returns {Promise<{ email: string|null, candidates: string[], source: string|null, status: 'found'|'no_email'|'dead'|'blocked' }>}
 */
export async function discoverEmailForWebsite(website) {
  if (!website || typeof website !== 'string') {
    return { email: null, candidates: [], source: null, status: 'dead' }
  }
  const variants = urlVariants(website)
  if (variants.length === 0) {
    return { email: null, candidates: [], source: null, status: 'dead' }
  }

  // Homepage: first variant that returns HTML wins. Track whether ANY variant
  // resolved at the network level so we can distinguish a dead domain from one
  // that resolves but blocks/errors.
  let home = null
  let origin = null
  let anyResolved = false
  for (const v of variants) {
    const r = await fetchRaw(v)
    if (r.resolved) anyResolved = true
    if (r.ok && r.html) {
      home = r.html
      try { origin = new URL(r.finalUrl || v).origin } catch { origin = new URL(v).origin }
      break
    }
  }
  if (!home) {
    return { email: null, candidates: [], source: null, status: anyResolved ? 'blocked' : 'dead' }
  }

  const siteHost = new URL(origin).hostname
  const seen = new Set()
  const candidates = []
  let source = null
  const consume = (emails, src) => {
    for (const raw of emails) {
      const email = raw.toLowerCase().trim().replace(/[.,;:)>\]]+$/, '')
      if (!isPlausibleEmail(email) || seen.has(email)) continue
      seen.add(email)
      candidates.push(email)
      if (!source) source = src
    }
  }

  consume(extractEmailsFromHtml(home), 'homepage')

  // Homepage dry → follow the site's own contact/about links, plus the standard
  // guessed paths, in one parallel round.
  if (candidates.length === 0) {
    const discovered = contactLinks(home, origin)
    const guessed = CONTACT_PATHS.map((p) => origin + p)
    const targets = [...new Set([...discovered, ...guessed])].slice(0, 8)
    const results = await Promise.all(targets.map((u) => fetchRaw(u).then((r) => r.html).catch(() => '')))
    results.forEach((html) => { if (html) consume(extractEmailsFromHtml(html), 'contact') })
  }

  if (candidates.length === 0) {
    return { email: null, candidates: [], source: null, status: 'no_email' }
  }

  const ranked = [...candidates].sort((a, b) => scoreEmail(b, siteHost) - scoreEmail(a, siteHost))
  return { email: ranked[0], candidates: ranked, source, status: 'found' }
}

const EMPTY_DISCOVERY = { email: null, candidates: [], source: null, status: 'no_email' }

// Hard wall-clock cap on a single site. The per-fetch AbortController usually
// bounds a site, but a pathological host (hung body, redirect loop) or a
// runaway parse can evade it and stall a worker — on a serverless function that
// stalls the WHOLE batch until the platform kills it. Racing each site against a
// real timer guarantees the worker moves on; the batch is bounded by
// ⌈items/concurrency⌉ × perSiteMs regardless of how any one host misbehaves.
function discoverWithCap(website, perSiteMs) {
  let timer
  const capped = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ...EMPTY_DISCOVERY, status: 'blocked' }), perSiteMs)
  })
  return Promise.race([
    discoverEmailForWebsite(website).catch(() => EMPTY_DISCOVERY),
    capped,
  ]).finally(() => clearTimeout(timer))
}

/**
 * Discover emails for many websites with bounded concurrency, a hard per-site
 * timeout, and an optional soft overall deadline. Each site is capped at
 * `perSiteMs`; when `deadlineMs` is set workers stop picking up new sites once
 * the budget is spent, so the caller gets partial results (a shorter array) it
 * can re-run rather than a serverless timeout.
 * @param {Array<{ id: string, website: string }>} items
 * @param {number} concurrency
 * @param {{ deadlineMs?: number, perSiteMs?: number }} [opts]
 * @returns {Promise<Array<{ id, website, email, candidates, source, status }>>}
 */
export async function discoverEmailsBatch(items, concurrency = 6, { deadlineMs = 0, perSiteMs = 18000 } = {}) {
  const out = []
  let idx = 0
  const deadline = deadlineMs > 0 ? Date.now() + deadlineMs : Infinity
  async function worker() {
    while (idx < items.length) {
      if (Date.now() >= deadline) return // budget spent — leave the rest unprocessed
      const i = idx++
      const item = items[i]
      const res = await discoverWithCap(item.website, perSiteMs)
      out[i] = { id: item.id, website: item.website, ...res }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return out.filter(Boolean)
}
