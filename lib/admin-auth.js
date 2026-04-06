import { jwtVerify } from 'jose'

/**
 * Verify admin authentication from cookies.
 * Supports both JWT tokens (current) and legacy raw-password cookies.
 */
export async function checkAdmin(cookieStore) {
  const token = cookieStore.get('atlas_admin')?.value
    || cookieStore.get('admin_auth')?.value
  if (!token) return false

  // Try JWT verification first (current auth flow)
  try {
    const secret = new TextEncoder().encode(
      process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
    )
    await jwtVerify(token, secret)
    return true
  } catch {
    // Fall back to legacy raw-password cookies
    return token === 'admin_authenticated' || token === process.env.ADMIN_PASSWORD
  }
}
