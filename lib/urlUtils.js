/**
 * URL normalisation and verification utilities
 * Used across all Atlas Network verticals
 */

/**
 * Normalise a URL string for storage:
 * - Add https:// if no protocol
 * - Strip trailing slashes
 * - Strip whitespace
 * - Lowercase the hostname
 */
export function normaliseUrl(url) {
  if (!url || typeof url !== 'string') return null

  // Strip whitespace
  url = url.trim()
  if (!url) return null

  // Add https:// if no protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }

  // Upgrade http to https
  if (url.startsWith('http://')) {
    url = 'https://' + url.slice(7)
  }

  try {
    const parsed = new URL(url)
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase()
    // Remove trailing slash on root paths
    let result = parsed.toString()
    if (result.endsWith('/') && parsed.pathname === '/') {
      result = result.slice(0, -1)
    }
    return result
  } catch {
    return null
  }
}

/**
 * Two-attempt URL verification:
 * 1. Try the URL as-is
 * 2. If it fails, try toggling www prefix
 * Returns { verified, finalUrl, status }
 */
export async function verifyUrl(url, timeoutMs = 10000) {
  const normalised = normaliseUrl(url)
  if (!normalised) {
    return { verified: false, finalUrl: null, status: 'invalid' }
  }

  // Attempt 1: try the URL as stored
  const attempt1 = await tryFetch(normalised, timeoutMs)
  if (attempt1.ok) {
    return { verified: true, finalUrl: normalised, status: 'verified' }
  }

  // Attempt 2: toggle www prefix
  const altUrl = toggleWww(normalised)
  if (altUrl && altUrl !== normalised) {
    const attempt2 = await tryFetch(altUrl, timeoutMs)
    if (attempt2.ok) {
      return { verified: true, finalUrl: altUrl, status: 'verified_www_corrected' }
    }
  }

  // Both failed
  return {
    verified: false,
    finalUrl: normalised,
    status: attempt1.error || 'unreachable',
  }
}

/**
 * Toggle www prefix on a URL:
 * - If URL has www, remove it
 * - If URL has no www, add it
 */
function toggleWww(url) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
    } else {
      parsed.hostname = 'www.' + parsed.hostname
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * Attempt a HEAD request with timeout and redirect following
 */
async function tryFetch(url, timeoutMs) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AustralianAtlas/1.0 (website-verification)',
      },
    })

    clearTimeout(timer)

    // Accept 200, 301, 302, 403 (some sites block HEAD but are live)
    if (res.status < 500) {
      return { ok: true, status: res.status }
    }

    return { ok: false, error: 'server_error', status: res.status }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'timeout' }
    }
    const msg = err.message || ''
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return { ok: false, error: 'dns_failure' }
    }
    if (msg.includes('ECONNREFUSED')) {
      return { ok: false, error: 'connection_refused' }
    }
    return { ok: false, error: 'fetch_failed' }
  }
}
