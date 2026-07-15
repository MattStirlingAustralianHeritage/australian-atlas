// lib/press-session.js
// Shared press (Newsroom) session validation and creation — the council
// pattern: an HMAC-signed cookie, no Supabase Auth user. Used by the press
// auth, data, and settings routes; middleware.js re-implements validation
// with Web Crypto for the edge (validatePressHmac) against the SAME
// resolved secret.

import crypto from 'crypto'

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export const PRESS_SESSION_COOKIE = 'press_session'

// Falls back through secrets that already exist on deployed environments so
// the newsroom works without a new env var. Set PRESS_SESSION_SECRET to give
// press sessions their own key. The middleware fallback chain must match.
export function getPressSecret() {
  const secret =
    process.env.PRESS_SESSION_SECRET ||
    process.env.COUNCIL_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    throw new Error(
      'No session secret available. Set PRESS_SESSION_SECRET (or COUNCIL_SESSION_SECRET / ADMIN_SESSION_SECRET).'
    )
  }
  return secret
}

/**
 * Validate a press_session cookie value.
 * @param {string|undefined} cookieValue — raw cookie string (pressId:slug:timestamp:hmac)
 * @returns {{ pressId: string, slug: string } | null}
 */
export function validatePressSession(cookieValue) {
  if (!cookieValue) return null

  const parts = cookieValue.split(':')
  if (parts.length !== 4) return null

  const [pressId, slug, timestamp, hmac] = parts
  const payload = `${pressId}:${slug}:${timestamp}`

  let expected
  try {
    expected = crypto.createHmac('sha256', getPressSecret()).update(payload).digest('hex')
  } catch {
    console.error('[press-session] Cannot validate: no session secret set')
    return null
  }

  if (hmac !== expected) return null

  if (Date.now() - parseInt(timestamp) > SESSION_MAX_AGE_MS) return null

  return { pressId, slug }
}

/**
 * Create a signed press session cookie value.
 * @param {string} pressId
 * @param {string} slug
 * @returns {string} — cookie value to store (pressId:slug:timestamp:hmac)
 */
export function createPressSessionValue(pressId, slug) {
  const payload = `${pressId}:${slug}:${Date.now()}`
  const hmac = crypto.createHmac('sha256', getPressSecret()).update(payload).digest('hex')
  return `${payload}:${hmac}`
}
