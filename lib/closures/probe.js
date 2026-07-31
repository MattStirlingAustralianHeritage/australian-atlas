// Closure-sweep website probe.
//
// Free tier of the monthly deep check: fetch the venue's website, classify
// reachability, and hand the visible text to the closure-phrase scanner.
// Only when this tier looks suspicious (or the venue has no website at all)
// does the sweep escalate to the paid Google Places check.
//
// Classification rules carry the hard-won lessons from the website liveness
// sweeps: classify on err.cause.code (fetch wraps the real network error),
// a TLS failure is NOT a dead site, and timeouts are treated as transient
// because bot-blocked sites time out routinely.

export const PROBE_TIMEOUT_MS = 12000
const MAX_BODY_BYTES = 300_000
const USER_AGENT = 'AustralianAtlas/1.0 (closure-sweep)'

/**
 * Map a thrown fetch error to a probe classification. Exported for tests.
 * The real network error code lives on err.cause.code (undici wraps it);
 * err.code is the fallback for plain-node environments.
 */
export function classifyProbeFailure(err) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'dead_timeout'
  const code = String(err?.cause?.code || err?.code || '')
  if (code === 'ENOTFOUND' || code === 'ENOENT_DNS') return 'dead_dns'
  if (code === 'ECONNREFUSED') return 'dead_refused'
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') return 'dead_timeout'
  // Certificate / handshake problems — the server is THERE, just misconfigured.
  if (/TLS|SSL|CERT/i.test(code) || code === 'EPROTO' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'tls_issue'
  }
  // EAI_AGAIN (transient DNS), ECONNRESET, and anything unrecognised: don't
  // call a site dead on a wobble.
  return 'fetch_error'
}

/** Map an HTTP status to a probe classification. Exported for tests. */
export function classifyProbeStatus(status) {
  if (status >= 200 && status < 400) return 'ok'
  if (status === 404 || status === 410) return 'http_gone'
  return 'http_error'
}

/**
 * Decide whether a listing's free-tier evidence justifies spending a Google
 * Places call. Exported for tests — this gate is what keeps a 10,000-listing
 * sweep inside a few dollars a month instead of ~$600.
 *
 * @returns {null | string} a reason string when escalation is warranted.
 */
export function placesEscalationReason({ website, probeClassification, siteScan, communityReports, closureStatus }) {
  if (!website) return 'no_website'
  if (probeClassification && ['dead_dns', 'dead_refused', 'http_gone'].includes(probeClassification)) return 'website_dead'
  if ((siteScan?.permanent?.length ?? 0) > 0) return 'site_says_closed'
  if ((siteScan?.temporary?.length ?? 0) > 0) return 'site_says_paused'
  if ((communityReports ?? 0) > 0) return 'community_reports'
  if (closureStatus === 'temporarily_closed') return 'recheck_temporary_closure'
  return null
}

/** Strip HTML down to visible text for the phrase scanner. Exported for tests. */
export function htmlToVisibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * GET the venue's website and classify it.
 * Returns { classification, statusCode, text } — text only for a 2xx HTML page.
 */
export async function probeWebsite(url, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    })
    const classification = classifyProbeStatus(res.status)
    let text = null
    if (classification === 'ok' && /text\/html/i.test(res.headers.get('content-type') || '')) {
      try {
        const raw = await readBodyCapped(res, MAX_BODY_BYTES)
        text = htmlToVisibleText(raw)
      } catch {
        // Body read failures don't change reachability — we just lose the scan.
      }
    } else {
      // Drain politely so the connection can be reused; ignore failures.
      res.body?.cancel?.().catch?.(() => {})
    }
    return { classification, statusCode: res.status, text }
  } catch (err) {
    return { classification: classifyProbeFailure(err), statusCode: 0, text: null }
  } finally {
    clearTimeout(timer)
  }
}

async function readBodyCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const t = await res.text()
    return t.slice(0, maxBytes)
  }
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (received < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
  }
  try { await reader.cancel() } catch { /* already done */ }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8').slice(0, maxBytes)
}
