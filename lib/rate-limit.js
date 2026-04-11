// lib/rate-limit.js
// Simple in-memory sliding-window rate limiter.
// Keyed by IP address. Not shared across serverless instances (acceptable for
// low-traffic endpoints — prevents accidental rapid-fire, not DDoS).

const windows = new Map()

const DEFAULT_WINDOW_MS = 60_000   // 1 minute
const DEFAULT_MAX_REQUESTS = 5     // 5 requests per window

/**
 * Check whether a request should be allowed.
 * @param {string} key   — unique identifier (typically IP address)
 * @param {object} opts  — { windowMs, maxRequests }
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number | null }}
 */
export function rateLimit(key, opts = {}) {
  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS
  const maxRequests = opts.maxRequests || DEFAULT_MAX_REQUESTS
  const now = Date.now()

  // Get or create the window entry
  let entry = windows.get(key)
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 }
    windows.set(key, entry)
  }

  entry.count += 1

  if (entry.count > maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart)
    return { allowed: false, remaining: 0, retryAfterMs }
  }

  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: null }
}

/**
 * Next.js helper — returns a 429 Response if rate-limited, or null if allowed.
 * @param {Request} request
 * @param {object} opts — { windowMs, maxRequests, keyPrefix }
 */
export function checkRateLimit(request, opts = {}) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  const key = `${opts.keyPrefix || 'global'}:${ip}`
  const result = rateLimit(key, opts)

  if (!result.allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.retryAfterMs || 60000) / 1000)),
        },
      }
    )
  }

  return null // allowed
}

// Periodic cleanup — remove stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of windows) {
      if (now - entry.windowStart > 120_000) {
        windows.delete(key)
      }
    }
  }, 300_000)
}
