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
const REMOVE_NS = 'outreach-remove'

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verify(token) {
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

export function signUnsubscribeToken(email) {
  return sign({ e: String(email).toLowerCase().trim(), p: NS })
}

export function verifyUnsubscribeToken(token) {
  const data = verify(token)
  if (!data || data.p !== NS || !data.e) return null
  return data.e
}

// Removal token: binds the recipient's email to ONE listing, so the "remove
// this listing" link in an outreach email can only take down the listing that
// email was about. Same no-expiry rationale as unsubscribe — the offer to be
// taken down shouldn't rot.
export function signRemovalToken(email, listingId) {
  return sign({ e: String(email).toLowerCase().trim(), l: String(listingId), p: REMOVE_NS })
}

export function verifyRemovalToken(token) {
  const data = verify(token)
  if (!data || data.p !== REMOVE_NS || !data.e || !data.l) return null
  return { email: data.e, listingId: data.l }
}
