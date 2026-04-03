import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'

/**
 * Admin authentication endpoint.
 * Verifies password against ADMIN_PASSWORD env var.
 * On success, creates a signed JWT session token stored as httpOnly cookie.
 *
 * Required env vars (set in Vercel dashboard, never committed):
 *   ADMIN_PASSWORD — the admin password
 *   ADMIN_SESSION_SECRET — a long random string for signing (generate with: openssl rand -base64 32)
 */
export async function POST(request) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Create signed session token
    const secret = new TextEncoder().encode(
      process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
    )

    const token = await new SignJWT({ role: 'admin', iat: Math.floor(Date.now() / 1000) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const response = NextResponse.json({ success: true })

    response.cookies.set('atlas_admin', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (err) {
    console.error('Admin auth error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
