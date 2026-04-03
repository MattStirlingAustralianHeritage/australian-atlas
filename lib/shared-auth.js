import { SignJWT, jwtVerify } from 'jose'

// Dedicated secret for cross-vertical auth tokens
// SHARED_AUTH_SECRET should be set as its own env var — fallback to ADMIN_PASSWORD
// is kept for backwards compatibility but should be migrated
const SECRET = new TextEncoder().encode(process.env.SHARED_AUTH_SECRET || process.env.ADMIN_PASSWORD)
const ISSUER = 'australian-atlas'

/**
 * Create a shared JWT for cross-vertical authentication.
 * The token carries identity + role so verticals can gate access without
 * hitting the network on every request.
 *
 * @param {object} user - Supabase auth user object
 * @param {object} profile - profiles table row (optional, looked up if missing)
 * @returns {string} Signed JWT
 */
export async function createSharedToken(user, profile = null) {
  // If no profile passed, fetch it from the database
  if (!profile) {
    try {
      const { getSupabaseAdmin } = await import('@/lib/supabase/clients')
      const supabase = getSupabaseAdmin()
      const { data } = await supabase
        .from('profiles')
        .select('role, full_name, avatar_url, vendor_verticals, council_id')
        .eq('id', user.id)
        .single()
      profile = data
    } catch {
      // Profile lookup failed — default to user role
      profile = null
    }
  }

  const role = profile?.role || 'user'
  const name = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email

  const payload = {
    sub: user.id,
    email: user.email,
    name,
    role,
  }

  // Include vendor_verticals for vendor role (so verticals know which ones they have access to)
  if (role === 'vendor' && profile?.vendor_verticals) {
    payload.verticals = profile.vendor_verticals
  }

  // Include council_id for council role
  if (role === 'council' && profile?.council_id) {
    payload.council_id = profile.council_id
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET)
}

/**
 * Verify a shared JWT and extract user info + role.
 *
 * @param {string} token - JWT to verify
 * @returns {{ valid: boolean, user: object|null }}
 */
export async function verifySharedToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER })
    return {
      valid: true,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role || 'user',
        verticals: payload.verticals || {},
        council_id: payload.council_id || null,
      },
    }
  } catch {
    return { valid: false, user: null }
  }
}
