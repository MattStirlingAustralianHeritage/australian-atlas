/**
 * Robust server-side page fetch for the admin classifier and enricher.
 *
 * Both run from Vercel serverless (a datacenter IP). Many operator sites sit
 * behind Cloudflare / WAFs that score datacenter-origin requests with bare bot
 * User-Agents as bots and return 403/429/503 — even when the same site loads
 * fine in a reviewer's browser. This helper:
 *
 *   1. Tries a DIRECT fetch with browser-like headers (full Chrome UA + Accept
 *      / Accept-Language / Sec-Fetch-*). Beats sites that block on headers alone.
 *   2. On a block or network error, falls back to the JINA READER proxy
 *      (r.jina.ai), which renders the page from residential infrastructure and
 *      returns clean text — defeating IP-reputation-based blocks our direct
 *      fetch can't.
 *
 * Returns { text, title, ogImage, status, via }:
 *   - text:   classifiable plain text, or null when both paths fail
 *   - title:  page <title> (direct) or Jina "Title:" line (reader), or null
 *   - ogImage: og:image URL (direct path only; null via reader)
 *   - status: most informative HTTP status — prefers the direct origin's, since
 *             that's what a reviewer would see in a browser
 *   - via:    'direct' | 'reader' on success; absent on total failure
 *
 * Optional env: JINA_API_KEY raises the reader proxy's rate limit (works
 * unauthenticated on the free tier too).
 */

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BROWSER_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
}

/** Strip an HTML document down to classifiable plain text. */
function htmlToText(html, maxChars) {
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
    .slice(0, maxChars)
}

/** Direct fetch with browser-like headers. */
async function fetchDirect(url, maxChars) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
      redirect: 'follow',
    })
    if (!res.ok) return { text: null, title: null, ogImage: null, status: res.status }

    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || null
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    const ogImage = ogMatch?.[1] || null

    return { text: htmlToText(html, maxChars), title, ogImage, status: res.status }
  } catch (err) {
    return { text: null, title: null, ogImage: null, status: 0, error: err.message || String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

/** Fallback fetch through the Jina reader proxy. Renders from residential
 *  infra and returns clean text, defeating bot/IP blocks on the direct path. */
async function fetchViaReader(url, maxChars) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    const headers = { 'User-Agent': BROWSER_UA }
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`

    // r.jina.ai expects the raw target URL appended: https://r.jina.ai/https://site/
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers,
      redirect: 'follow',
    })
    if (!res.ok) return { text: null, title: null, ogImage: null, status: res.status }

    const body = await res.text()
    // Jina prepends "Title:" / "URL Source:" metadata before the page content.
    const titleMatch = body.match(/^Title:\s*(.+)$/m)
    const title = titleMatch?.[1]?.trim() || null
    const text = body.replace(/\s+/g, ' ').trim().slice(0, maxChars)

    return { text: text || null, title, ogImage: null, status: res.status }
  } catch (err) {
    return { text: null, title: null, ogImage: null, status: 0, error: err.message || String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch a page and return classifiable plain text, with a reader-proxy fallback
 * for bot-blocked origins.
 *
 * @param {string} url - normalised https:// URL
 * @param {{ maxChars?: number }} [opts]
 * @returns {Promise<{ text: string|null, title: string|null, ogImage: string|null, status: number, via?: 'direct'|'reader' }>}
 */
export async function fetchSiteText(url, { maxChars = 7000 } = {}) {
  const direct = await fetchDirect(url, maxChars)
  if (direct.text) return { ...direct, via: 'direct' }

  const reader = await fetchViaReader(url, maxChars)
  if (reader.text) return { ...reader, via: 'reader' }

  // Both paths failed — report the most informative status, preferring the
  // direct origin's (what a reviewer sees in a browser) over the proxy's.
  return { text: null, title: null, ogImage: null, status: direct.status || reader.status || 0 }
}
