/**
 * Mint a shared-auth JWT from the current Supabase session (same origin).
 *
 * The portal dashboard authenticates via the cross-vertical shared token, but
 * on the portal origin that token is never stored — the session cookie is the
 * source of truth. This fetches /api/auth/token to bridge the two.
 *
 * Returns the token string, or null if the visitor is not signed in.
 */
export async function getDashboardToken() {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'same-origin' })
    if (!res.ok) return null
    const { token } = await res.json()
    return token || null
  } catch {
    return null
  }
}
