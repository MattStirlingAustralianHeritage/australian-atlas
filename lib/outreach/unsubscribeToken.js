import crypto from 'node:crypto'

// Stateless unsubscribe token. We sign the recipient email so the unsubscribe
// link never needs a stored secret per-recipient, and — unlike the newsletter
// confirm token — it does NOT expire: a functional unsubscribe must keep working
// indefinitely (Spam Act 2003 requires it stay live for at least 30 days; we
// give it forever). HMAC-SHA256 with the existing admin/session secret so no new
// env var is required. Namespaced payload so it can't be replayed elsewhere.
const SECRET =
  process.env.NEWSLETTER_CONFIRM_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  ''

const NS = 'outreach-unsub'

export function signUnsubscribeToken(email) {
  const payload = Buffer.from(
    JSON.stringify({ e: String(email).toLowerCase().trim(), p: NS })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyUnsubscribeToken(token) {
  if (!SECRET || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { e, p } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (p !== NS || !e) return null
    return e
  } catch {
    return null
  }
}
