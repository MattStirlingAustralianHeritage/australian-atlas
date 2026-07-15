// lib/press/tokens.js
// Stateless signed-action tokens for newsroom emails and feeds — HMAC-SHA256,
// namespaced per action so a token can't be replayed against a different one,
// non-expiring (a functional unsubscribe link must keep working
// indefinitely), no new env var required.

import crypto from 'node:crypto'

const SECRET =
  process.env.PRESS_SESSION_SECRET ||
  process.env.COUNCIL_SESSION_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  ''

const NS_UNSUB = 'press-unsub'
const NS_ICS = 'press-ics'

function signPayload(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyPayload(token) {
  if (!SECRET || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
}

// ── One-click unsubscribe (flips the account's cadence to 'off') ──────────

export function signPressUnsubscribeToken({ pressId, email }) {
  return signPayload({
    i: String(pressId),
    e: String(email).toLowerCase().trim(),
    p: NS_UNSUB,
  })
}

export function verifyPressUnsubscribeToken(token) {
  const data = verifyPayload(token)
  if (!data || data.p !== NS_UNSUB || !data.i || !data.e) return null
  return { pressId: data.i, email: data.e }
}

// ── Personal ICS calendar feed (subscribable, no login on the calendar) ───

export function signPressIcsToken(pressId) {
  return signPayload({ i: String(pressId), p: NS_ICS })
}

export function verifyPressIcsToken(token) {
  const data = verifyPayload(token)
  if (!data || data.p !== NS_ICS || !data.i) return null
  return { pressId: data.i }
}
