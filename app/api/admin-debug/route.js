import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'

/**
 * Debug endpoint — visit /api/admin-debug in your browser to see cookie state.
 * Remove after fixing the admin redirect issue.
 */
export async function GET() {
  const cookieStore = await cookies()
  const atlasAdmin = cookieStore.get('atlas_admin')
  const adminAuth = cookieStore.get('admin_auth')
  const allCookies = cookieStore.getAll().map(c => c.name)

  const debug = {
    cookies_present: allCookies,
    atlas_admin_exists: !!atlasAdmin?.value,
    admin_auth_exists: !!adminAuth?.value,
    atlas_admin_length: atlasAdmin?.value?.length || 0,
    admin_auth_length: adminAuth?.value?.length || 0,
    env_has_session_secret: !!process.env.ADMIN_SESSION_SECRET,
    env_has_password: !!process.env.ADMIN_PASSWORD,
  }

  // Try to verify the JWT
  const token = atlasAdmin?.value || adminAuth?.value
  if (token) {
    try {
      const secret = new TextEncoder().encode(
        process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
      )
      const { payload } = await jwtVerify(token, secret)
      debug.jwt_valid = true
      debug.jwt_payload = { role: payload.role, exp: payload.exp, iat: payload.iat }
      debug.jwt_expired = payload.exp ? payload.exp < Math.floor(Date.now() / 1000) : 'no-exp'
    } catch (err) {
      debug.jwt_valid = false
      debug.jwt_error = err.message
      debug.jwt_code = err.code

      // Check legacy password match
      if (token === process.env.ADMIN_PASSWORD) {
        debug.legacy_password_match = true
      } else {
        debug.legacy_password_match = false
      }
    }
  }

  return NextResponse.json(debug, { status: 200 })
}
