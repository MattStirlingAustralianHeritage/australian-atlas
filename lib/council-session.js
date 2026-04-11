// lib/council-session.js
// Shared council session validation and creation.
// Used by council auth, data, and checkout routes.

import crypto from 'crypto'

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function getSecret() {
  const secret = process.env.COUNCIL_SESSION_SECRET
  if (!secret) {
    throw new Error(
      'COUNCIL_SESSION_SECRET is not set. Council session operations require this env var.'
    )
  }
  return secret
}

/**
 * Validate a council_session cookie value.
 * @param {string|undefined} cookieValue — raw cookie string (councilId:slug:timestamp:hmac)
 * @returns {{ councilId: string, slug: string } | null}
 */
export function validateCouncilSession(cookieValue) {
  if (!cookieValue) return null

  const parts = cookieValue.split(':')
  if (parts.length !== 4) return null

  const [councilId, slug, timestamp, hmac] = parts
  const payload = `${councilId}:${slug}:${timestamp}`

  let expected
  try {
    expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  } catch {
    // Missing secret — treat as invalid session
    console.error('[council-session] Cannot validate: COUNCIL_SESSION_SECRET not set')
    return null
  }

  if (hmac !== expected) return null

  // Check session age
  if (Date.now() - parseInt(timestamp) > SESSION_MAX_AGE_MS) return null

  return { councilId, slug }
}

/**
 * Create a signed council session cookie value.
 * @param {string} councilId
 * @param {string} slug
 * @returns {string} — cookie value to store (councilId:slug:timestamp:hmac)
 */
export function createSessionValue(councilId, slug) {
  const payload = `${councilId}:${slug}:${Date.now()}`
  const hmac = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  return `${payload}:${hmac}`
}
