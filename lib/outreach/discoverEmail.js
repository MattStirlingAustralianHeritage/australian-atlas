// ============================================================
// Outreach email discovery
// ------------------------------------------------------------
// Listings carry a website + phone but no email. To run outreach we discover a
// contact email from the operator's own website: the homepage and, if needed, a
// contact/about page. We read mailto: links, plain-text addresses, and decode
// Cloudflare-obfuscated emails, then filter platform junk and score for the
// best same-domain, role-based address (info@, hello@, bookings@ …).
//
// This never fabricates an address — it only extracts what the operator has
// conspicuously published, which is the basis for lawful B2B contact under the
// Spam Act 2003 (Cth). Everything is best-effort and fails soft.
// ============================================================

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 1_500_000 // don't parse multi-MB pages

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36 AustralianAtlasBot/1.0 ' +
  '(+https://australianatlas.com.au/about)'

// Common contact-ish paths tried (in addition to the homepage) when the
// homepage alone yields nothing.
const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/contact.html']

// Local-parts that read like a real inbox a human checks — ranked highest.
const ROLE_LOCALPARTS = [
  'hello', 'hi', 'info', 'contact', 'enquiries', 'enquiry', 'inquiries',
  'bookings', 'booking', 'reservations', 'reception', 'office', 'admin',
  'orders', 'shop', 'sales', 'cellardoor', 'cellar', 'team', 'studio',
  'mail', 'email', 'hey', 'stay', 'eat', 'dine', 'events',
]

// Substrings that mark an address as platform noise / not an operator inbox.
const JUNK_SUBSTRINGS = [
  'sentry', 'wixpress', 'wix.com', 'squarespace', 'godaddy', 'wordpress',
  'shopify', 'cloudflare', 'example.', 'yourdomain', 'domain.com', 'email.com',
  'sentry.io', 'localhost', 'test.com', 'name@', 'user@', 'email@address',
  'firstname', 'lastname', 'yourname', 'someone@', 'abc@', 'xyz@',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'abuse@', 'privacy@', 'unsubscribe@', 'bounce',
  'react', 'protolabs', 'w3.org', 'schema.org', 'googlemail-noreply',
]

// Extensions that mean we matched an asset filename, not an email.
const ASSET_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.ico', '.woff', '.woff2']

const EMAIL_RE = /[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi

function withTimeout(promise, ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, done: () => clearTimeout(t) }
}

async function fetchText(url) {
  const { signal, done } = withTimeout(null, FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    const ctype = res.headers.get('content-type') || ''
    if (ctype && !ctype.includes('html') && !ctype.includes('text')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_HTML_BYTES) {
      return Buffer.from(buf.slice(0, MAX_HTML_BYTES)).toString('utf8')
    }
    return Buffer.from(buf).toString('utf8')
  } catch {
    return null
  } finally {
    done()
  }
}

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
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, '@')
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, '.')
}

function registrableHost(host) {
  if (!host) return ''
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  if (parts.length <= 2) return parts.join('.')
  // Handle common AU/second-level TLDs: com.au, net.au, org.au, co.uk …
  const twoLevel = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'id'])
  const last = parts[parts.length - 1]
  const secondLast = parts[parts.length - 2]
  if (twoLevel.has(secondLast) && last.length === 2) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function extractEmailsFromHtml(html) {
  const found = new Set()

  // 1. Cloudflare-obfuscated addresses.
  const cfRe = /data-cfemail="([0-9a-fA-F]+)"/g
  let m
  while ((m = cfRe.exec(html)) !== null) {
    const dec = decodeCfEmail(m[1])
    if (dec) found.add(dec)
  }

  // 2. mailto: links (highest confidence — the operator meant these).
  const mailtoRe = /mailto:([^"'?>\s]+)/gi
  while ((m = mailtoRe.exec(html)) !== null) {
    found.add(decodeURIComponent(m[1]))
  }

  // 3. Plain-text addresses (incl. lightly obfuscated) anywhere in the markup.
  const decoded = htmlDecode(html)
  const textRe = new RegExp(EMAIL_RE.source, 'gi')
  while ((m = textRe.exec(decoded)) !== null) {
    found.add(m[0])
  }

  return [...found]
}

function isPlausibleEmail(email) {
  if (!email) return false
  const e = email.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false
  if (e.length > 100) return false
  if (ASSET_SUFFIXES.some((s) => e.endsWith(s))) return false
  if (JUNK_SUBSTRINGS.some((s) => e.includes(s))) return false
  // Reject sprite/asset matches like "logo@2x.png" already covered, but also
  // reject purely numeric local parts and version-looking hosts.
  const [local, host] = e.split('@')
  if (!local || !host) return false
  if (/@\d+\.\d+/.test(e)) return false // e.g. jquery@3.6
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

/**
 * Discover the best contact email for a website.
 * @param {string} website  Operator website URL (may lack protocol).
 * @returns {Promise<{ email: string|null, candidates: string[], source: string|null }>}
 */
export async function discoverEmailForWebsite(website) {
  if (!website || typeof website !== 'string') {
    return { email: null, candidates: [], source: null }
  }

  let base
  try {
    const withProto = /^https?:\/\//i.test(website) ? website : `https://${website}`
    base = new URL(withProto)
  } catch {
    return { email: null, candidates: [], source: null }
  }
  const siteHost = base.hostname

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

  // Homepage first.
  const homeHtml = await fetchText(base.origin + (base.pathname || '/'))
  if (homeHtml) consume(extractEmailsFromHtml(homeHtml), 'homepage')

  // If the homepage yielded nothing usable, try contact/about pages in
  // parallel (bounded — 4 paths, one round-trip).
  if (candidates.length === 0) {
    const results = await Promise.all(
      CONTACT_PATHS.map((p) => fetchText(base.origin + p).catch(() => null))
    )
    results.forEach((html, i) => {
      if (html) consume(extractEmailsFromHtml(html), `path:${CONTACT_PATHS[i]}`)
    })
  }

  if (candidates.length === 0) {
    return { email: null, candidates: [], source: null }
  }

  const ranked = [...candidates].sort((a, b) => scoreEmail(b, siteHost) - scoreEmail(a, siteHost))
  return { email: ranked[0], candidates: ranked, source }
}

/**
 * Discover emails for many websites with bounded concurrency and an optional
 * soft deadline. When `deadlineMs` is set, workers stop picking up new sites once
 * the budget is spent — the caller gets partial results (and can see how many
 * were processed) instead of the whole request being killed mid-flight by the
 * serverless timeout, which would surface to the browser as a non-JSON 504.
 * @param {Array<{ id: string, website: string }>} items
 * @param {number} concurrency
 * @param {{ deadlineMs?: number }} [opts]
 * @returns {Promise<Array<{ id, website, email, candidates, source }>>}  sparse if the deadline hit
 */
export async function discoverEmailsBatch(items, concurrency = 6, { deadlineMs = 0 } = {}) {
  const out = []
  let idx = 0
  const deadline = deadlineMs > 0 ? Date.now() + deadlineMs : Infinity
  async function worker() {
    while (idx < items.length) {
      if (Date.now() >= deadline) return // budget spent — leave the rest unprocessed
      const i = idx++
      const item = items[i]
      const res = await discoverEmailForWebsite(item.website)
      out[i] = { id: item.id, website: item.website, ...res }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return out.filter(Boolean)
}
