import crypto from 'node:crypto'

// Stateless double-opt-in token for newsletter confirmation. We sign an
// (email, expiry) pair so we never have to store a "pending" row — the
// subscriber is only written to newsletter_subscribers once they click the
// confirmation link. HMAC-SHA256 with the same server secret the admin session
// uses (no new env var required); namespaced payload so it can't be reused.
const SECRET =
  process.env.NEWSLETTER_CONFIRM_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  ''
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function signNewsletterToken(email) {
  const payload = Buffer.from(
    JSON.stringify({ e: email, x: Date.now() + TTL_MS, p: 'newsletter' })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyNewsletterToken(token) {
  if (!SECRET || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { e, x, p } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (p !== 'newsletter' || !e || typeof x !== 'number' || Date.now() > x) return null
    return e
  } catch {
    return null
  }
}
